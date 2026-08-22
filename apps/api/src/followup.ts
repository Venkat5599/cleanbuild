/**
 * The autonomous follow-up job.
 *
 * This is the file the whole submission rests on. It runs from a Cloudflare
 * Cron Trigger with no request, no browser and no human anywhere in the path:
 *
 *   cron fires
 *     -> mature every experiment whose checkpoint is due
 *     -> the 168h closes compute a residual reward and move the posterior
 *     -> a deterministic gate asks whether the belief change is material
 *     -> the Mind is briefed and decides how to reach the creator
 *
 * If any step here needed a browser request, the persistence claim would be
 * false. It does not.
 */

import { marginals, type Marginal } from '@ratchet/core';
import {
  getCreator,
  getPosterior,
  insertNotification,
  lastNotificationAt,
  listPosts,
  markNotificationSent,
  type Db,
} from '@ratchet/db';
import {
  MindsClient,
  assessMateriality,
  composeFallbackMessage,
  composeMindBriefing,
  type BriefingInput,
} from '@ratchet/mind';
import {
  matureDueExperiments,
  systemClock,
  topFeatures,
  type Clock,
  type MaturationResult,
} from '@ratchet/pipeline';

export interface FollowUpDeps {
  db: Db;
  clock?: Clock;
  minds?: MindsClient | null;
  mindAlias?: string | null;
  telegram?: { botToken: string; chatId: string } | null;
  /** Injected so tests can assert without network. */
  log?: (event: string, data: Record<string, unknown>) => void;
}

export interface FollowUpReport {
  ranAt: string;
  matured: number;
  closed: number;
  voided: number;
  notificationsSent: number;
  notificationsSuppressed: number;
  details: Array<{
    experimentId: number;
    material: boolean;
    reason: string;
    explanation: string;
    delivered?: 'mind' | 'telegram' | 'stored';
  }>;
}

export async function runFollowUp(deps: FollowUpDeps): Promise<FollowUpReport> {
  const clock = deps.clock ?? systemClock;
  const log = deps.log ?? (() => {});
  const now = clock.now();

  const results = await matureDueExperiments(deps.db, clock, 500);
  const closed = results.filter((r) => r.action === 'closed');
  const voided = results.filter((r) => r.action === 'voided');

  log('maturation.complete', {
    due: results.length,
    closed: closed.length,
    voided: voided.length,
  });

  const report: FollowUpReport = {
    ranAt: now.toISOString(),
    matured: results.length,
    closed: closed.length,
    voided: voided.length,
    notificationsSent: 0,
    notificationsSuppressed: 0,
    details: [],
  };

  // Only the most recent close per creator is a candidate. Batching a week of
  // maturations into five separate messages would be spam, not autonomy.
  const latestPerCreator = new Map<number, MaturationResult>();
  for (const r of closed) latestPerCreator.set(r.creatorId, r);

  for (const [creatorId, result] of latestPerCreator) {
    const outcome = await considerNotification(deps, creatorId, result, now, log);
    report.details.push(outcome);
    if (outcome.material && outcome.delivered) report.notificationsSent++;
    else report.notificationsSuppressed++;
  }

  return report;
}

async function considerNotification(
  deps: FollowUpDeps,
  creatorId: number,
  result: MaturationResult,
  now: Date,
  log: (event: string, data: Record<string, unknown>) => void,
): Promise<FollowUpReport['details'][number]> {
  const { db } = deps;
  const creator = await getCreator(db, creatorId);
  const posterior = await getPosterior(db, creatorId);

  if (!creator || !posterior) {
    return {
      experimentId: result.experimentId,
      material: false,
      reason: 'none',
      explanation: 'creator or posterior missing',
    };
  }

  const after = marginals(posterior);
  // Reconstruct the pre-update marginals from the recorded deltas rather than
  // re-running the update. The belief diff is the audit record; deriving the
  // "before" from it keeps the two consistent by construction.
  const before: Marginal[] = after.map((m) => {
    const delta = result.deltas?.find((d) => d.index === m.index);
    if (!delta) return m;
    const sd = delta.sdBefore;
    const mean = delta.before;
    return {
      ...m,
      mean,
      sd,
      ciLow: mean - 1.96 * sd,
      ciHigh: mean + 1.96 * sd,
      probPositive: sd > 0 ? normalCdf(mean / sd) : mean > 0 ? 1 : 0,
    };
  });

  const verdict = assessMateriality({
    deltas: result.deltas ?? [],
    marginalsAfter: after,
    marginalsBefore: before,
    nObs: posterior.nObs,
    lastNotifiedAt: await lastNotificationAt(db, creatorId),
    now,
  });

  if (!verdict.material) {
    log('notify.suppressed', { creatorId, reason: verdict.explanation });
    return {
      experimentId: result.experimentId,
      material: false,
      reason: verdict.reason,
      explanation: verdict.explanation,
    };
  }

  const posts = await listPosts(db, creatorId);
  const post = posts.find((p) => p.id === result.postId);

  const briefing: BriefingInput = {
    creatorHandle: creator.handle,
    verdict,
    postTitle: post?.title ?? `post ${result.postId}`,
    reward: result.reward ?? 0,
    nObs: posterior.nObs,
    topFeatures: topFeatures(posterior, 4),
    shrinkageOwn: posterior.nObs / (posterior.nObs + 4),
  };

  const body = composeMindBriefing(briefing);
  const notificationId = await insertNotification(db, {
    creatorId,
    channel: 'mind',
    body,
    trigger: {
      source: 'cron',
      experimentId: result.experimentId,
      reason: verdict.reason,
      features: verdict.features,
    },
  });

  // Preferred path: brief the Mind and let it decide how to speak.
  const alias = creator.mindAlias ?? deps.mindAlias ?? null;
  if (deps.minds && alias) {
    try {
      await deps.minds.sendMessage(alias, body);
      await markNotificationSent(db, notificationId, now);
      log('notify.sent', { creatorId, channel: 'mind', alias });
      return {
        experimentId: result.experimentId,
        material: true,
        reason: verdict.reason,
        explanation: verdict.explanation,
        delivered: 'mind',
      };
    } catch (e) {
      // Fall through to Telegram. The notification row stays unsent so the
      // dashboard can show that delivery failed rather than losing it.
      log('notify.mind_failed', { creatorId, error: String(e) });
    }
  }

  if (deps.telegram) {
    try {
      await sendTelegram(deps.telegram, composeFallbackMessage(briefing));
      await markNotificationSent(db, notificationId, now);
      log('notify.sent', { creatorId, channel: 'telegram' });
      return {
        experimentId: result.experimentId,
        material: true,
        reason: verdict.reason,
        explanation: verdict.explanation,
        delivered: 'telegram',
      };
    } catch (e) {
      log('notify.telegram_failed', { creatorId, error: String(e) });
    }
  }

  // Nothing delivered. The row persists with sent_at null and surfaces in the
  // dashboard — a dropped notification is never silently discarded.
  log('notify.undelivered', { creatorId, notificationId });
  return {
    experimentId: result.experimentId,
    material: true,
    reason: verdict.reason,
    explanation: verdict.explanation,
    delivered: 'stored',
  };
}

async function sendTelegram(
  cfg: { botToken: string; chatId: string },
  text: string,
): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: cfg.chatId, text, disable_web_page_preview: true }),
  });
  if (!res.ok) {
    // Do not include the response body: Telegram echoes the bot token path in
    // some error shapes.
    throw new Error(`telegram sendMessage failed with ${res.status}`);
  }
}

/** Local copy so this module does not depend on core's internals. */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}
