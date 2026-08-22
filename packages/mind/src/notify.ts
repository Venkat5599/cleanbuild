/**
 * Autonomous follow-up.
 *
 * The materiality question — "is this belief change worth interrupting a human
 * for?" — is answered in two stages:
 *
 *   1. A deterministic gate here. Cheap, testable, and it enforces the hard
 *      limits (rate limit, minimum evidence) that must hold regardless of what
 *      any model thinks.
 *   2. The Mind itself, which receives the surviving events with its own
 *      persistent context and decides how to speak to the creator.
 *
 * Stage 1 exists because a rate limit implemented as a prompt instruction is
 * not a rate limit.
 */

import type { BeliefDelta, Marginal } from '@ratchet/core';

export const NOTIFY_RATE_LIMIT_MS = 24 * 3_600_000;

/** Probability at which a feature stops being a guess and becomes a finding. */
export const CONFIDENCE_THRESHOLD = 0.9;
/** Below this, the posterior is still mostly the niche prior talking. */
export const MIN_OBSERVATIONS = 20;

export type MaterialityReason =
  | 'crossed_confidence'
  | 'belief_reversed'
  | 'large_move'
  | 'none';

export interface MaterialityInput {
  deltas: BeliefDelta[];
  /** Marginals AFTER the update, index-aligned with the posterior. */
  marginalsAfter: Marginal[];
  /** Same features BEFORE the update. */
  marginalsBefore: Marginal[];
  nObs: number;
  lastNotifiedAt: Date | null;
  now: Date;
}

export interface MaterialityVerdict {
  material: boolean;
  reason: MaterialityReason;
  /** The features that triggered it, most significant first. */
  features: string[];
  explanation: string;
}

/**
 * Decide whether a belief change is worth an unprompted message.
 *
 * Three things qualify. Everything else is noise and stays in the dashboard.
 */
export function assessMateriality(input: MaterialityInput): MaterialityVerdict {
  const { deltas, marginalsAfter, marginalsBefore, nObs, lastNotifiedAt, now } = input;

  if (nObs < MIN_OBSERVATIONS) {
    return {
      material: false,
      reason: 'none',
      features: [],
      explanation: `only ${nObs} closed experiments, below the ${MIN_OBSERVATIONS} needed before a finding is worth stating`,
    };
  }

  if (lastNotifiedAt && now.getTime() - lastNotifiedAt.getTime() < NOTIFY_RATE_LIMIT_MS) {
    return {
      material: false,
      reason: 'none',
      features: [],
      explanation: 'rate limited: a proactive message already went out in the last 24h',
    };
  }

  const byIndex = new Map(marginalsBefore.map((m) => [m.index, m]));

  // 1. A feature crossed the confidence threshold in either direction. This is
  //    the moment a hunch becomes something the creator can act on.
  const crossed = marginalsAfter.filter((after) => {
    const before = byIndex.get(after.index);
    if (!before) return false;
    const wasConfident =
      before.probPositive >= CONFIDENCE_THRESHOLD ||
      before.probPositive <= 1 - CONFIDENCE_THRESHOLD;
    const isConfident =
      after.probPositive >= CONFIDENCE_THRESHOLD ||
      after.probPositive <= 1 - CONFIDENCE_THRESHOLD;
    return !wasConfident && isConfident;
  });

  if (crossed.length > 0) {
    const names = crossed.map((m) => m.name);
    const first = crossed[0]!;
    const direction = first.probPositive >= CONFIDENCE_THRESHOLD ? 'works' : 'does not work';
    return {
      material: true,
      reason: 'crossed_confidence',
      features: names,
      explanation: `${first.name} crossed ${Math.round(CONFIDENCE_THRESHOLD * 100)}% confidence that it ${direction}`,
    };
  }

  // 2. A previously confident belief flipped sign. Being wrong out loud matters
  //    more than being right quietly.
  const reversed = marginalsAfter.filter((after) => {
    const before = byIndex.get(after.index);
    if (!before) return false;
    const wasConfident =
      before.probPositive >= CONFIDENCE_THRESHOLD ||
      before.probPositive <= 1 - CONFIDENCE_THRESHOLD;
    return wasConfident && Math.sign(before.mean) !== Math.sign(after.mean);
  });

  if (reversed.length > 0) {
    return {
      material: true,
      reason: 'belief_reversed',
      features: reversed.map((m) => m.name),
      explanation: `${reversed[0]!.name} reversed direction after being treated as settled`,
    };
  }

  // 3. A single experiment moved a weight unusually far.
  const large = deltas.filter((d) => Math.abs(d.delta) >= 0.15);
  if (large.length > 0) {
    return {
      material: true,
      reason: 'large_move',
      features: large.map((d) => d.name),
      explanation: `${large[0]!.name} moved ${large[0]!.delta >= 0 ? '+' : ''}${large[0]!.delta.toFixed(2)} on a single result`,
    };
  }

  return {
    material: false,
    reason: 'none',
    features: [],
    explanation: 'belief change was within normal drift',
  };
}

export interface BriefingInput {
  creatorHandle: string;
  verdict: MaterialityVerdict;
  postTitle: string;
  reward: number;
  nObs: number;
  topFeatures: Marginal[];
  shrinkageOwn: number;
  /** Days since the creator last spoke to the Mind, if known. */
  daysSinceLastContact?: number;
}

/**
 * Compose the message the worker sends INTO the Mind.
 *
 * This is not the message the creator reads. It is a structured briefing; the
 * Mind decides tone, timing and whether to reach out at all, using memory this
 * process cannot see. Writing the creator-facing copy here would put the
 * judgement in the cron job, which is exactly backwards.
 */
export function composeMindBriefing(input: BriefingInput): string {
  const {
    creatorHandle,
    verdict,
    postTitle,
    reward,
    nObs,
    topFeatures,
    shrinkageOwn,
    daysSinceLastContact,
  } = input;

  const lines: string[] = [];
  lines.push(`RATCHET update for ${creatorHandle}. No human triggered this; an experiment matured.`);
  lines.push('');
  lines.push(`Experiment closed: "${postTitle}"`);
  lines.push(
    `Result: ${reward >= 0 ? 'beat' : 'missed'} its predicted baseline by ${Math.abs(reward).toFixed(2)} standard deviations.`,
  );
  lines.push('');
  lines.push(`Why this is worth surfacing: ${verdict.explanation}.`);
  lines.push(`Features involved: ${verdict.features.join(', ') || 'none individually'}.`);
  lines.push('');
  lines.push(`Current strongest effects, after ${nObs} closed experiments:`);
  for (const f of topFeatures) {
    lines.push(
      `  ${f.name}: ${f.mean >= 0 ? '+' : ''}${f.mean.toFixed(2)} ` +
        `(95% CI ${f.ciLow.toFixed(2)} to ${f.ciHigh.toFixed(2)}, ` +
        `P(helps) ${(f.probPositive * 100).toFixed(0)}%)`,
    );
  }
  lines.push('');
  lines.push(
    `Belief mix: ${Math.round(shrinkageOwn * 100)}% this creator's own data, ` +
      `${Math.round((1 - shrinkageOwn) * 100)}% niche prior.`,
  );

  if (daysSinceLastContact !== undefined && daysSinceLastContact >= 2) {
    lines.push('');
    lines.push(
      `You have not spoken in ${Math.round(daysSinceLastContact)} days. Open by reconnecting to what was running when you last talked, then give the update.`,
    );
  }

  lines.push('');
  lines.push(
    'Report the credible intervals, never a bare point estimate. If the evidence is thin, say so plainly rather than overstating it.',
  );

  return lines.join('\n');
}

/**
 * Fallback creator-facing text for the Telegram channel when the Mind is
 * unreachable. Deliberately plain: this is a delivery fallback, not a second
 * voice for the product.
 */
export function composeFallbackMessage(input: BriefingInput): string {
  const { verdict, postTitle, reward, topFeatures } = input;
  const top = topFeatures[0];
  return [
    `RATCHET: an experiment just closed.`,
    `"${postTitle}" ${reward >= 0 ? 'beat' : 'missed'} its baseline by ${Math.abs(reward).toFixed(2)} sigma.`,
    verdict.explanation.charAt(0).toUpperCase() + verdict.explanation.slice(1) + '.',
    top
      ? `Strongest effect so far: ${top.name} at ${top.mean >= 0 ? '+' : ''}${top.mean.toFixed(2)} (95% CI ${top.ciLow.toFixed(2)} to ${top.ciHigh.toFixed(2)}).`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
