/**
 * oRPC router — the typed contract between the Worker and the dashboard.
 *
 * The dashboard imports the inferred types from here, so a schema change breaks
 * the build rather than the page.
 *
 * Read-only by design. Nothing in the dashboard can move a belief: the
 * posterior is written by the maturation job and the nightly refit, and by
 * nothing else. A UI that could nudge the numbers would make the whole audit
 * trail meaningless.
 */

import { os } from '@orpc/server';
import * as z from 'zod';
import { marginals, probPositive, featureIndex, FEATURE_NAMES } from '@ratchet/core';
import {
  activeExperiments,
  beliefDiffsForExperiment,
  cadenceOf,
  closedExperiments,
  getCreator,
  getExperimentById,
  getFeatureLabels,
  getNichePrior,
  getPost,
  getPosterior,
      getPosteriorMeta,
      getSnapshot,
  listBriefs,
  listBits,
  listClaims,
  listCreators,
  listGateEvents,
  listNotifications,
  listSnapshotWeeks,
  metricsForPost,
  recentBeliefDiffs,
  type Db,
} from '@ratchet/db';
import { confoundContexts } from '@ratchet/pipeline';
import type { Env } from './index.js';

interface Ctx {
  db: Db;
  env: Env;
}

const base = os.$context<Ctx>();

const creatorInput = z.object({ creatorId: z.number().int().positive() });

/** Serialisable marginal. Float64Array never crosses the wire. */
const marginalOut = z.object({
  index: z.number(),
  name: z.string(),
  mean: z.number(),
  sd: z.number(),
  ciLow: z.number(),
  ciHigh: z.number(),
  probPositive: z.number(),
});

export const router = {
  creators: base.handler(async ({ context }) => {
    const rows = await listCreators(context.db);
    return rows.map((c) => ({
      id: c.id,
      handle: c.handle,
      platform: c.platform,
      niche: c.niche,
      followers: c.followers,
      explorationBudget: c.explorationBudget,
    }));
  }),

  /**
   * The posterior, as the dashboard renders it.
   * Always ships credible intervals. There is no endpoint that returns a bare
   * point estimate, because there is no context in which showing one is honest.
   */
  posterior: base
    .input(creatorInput)
    .output(
      z.object({
        nObs: z.number(),
        dim: z.number(),
        shrinkageOwn: z.number(),
        nichePooled: z.boolean(),
        marginals: z.array(marginalOut),
      }),
    )
    .handler(async ({ input, context }) => {
      const p = await getPosterior(context.db, input.creatorId);
      if (!p) throw new Error('no posterior yet for this creator');

      const creator = await getCreator(context.db, input.creatorId);
      const niche = creator ? await getNichePrior(context.db, creator.niche) : null;
      const tau2 = niche?.prior.tau2 ?? 0.25;

      return {
        nObs: p.nObs,
        dim: p.d,
        shrinkageOwn: p.nObs / (p.nObs + 1 / tau2),
        nichePooled: niche?.pooled ?? false,
        marginals: marginals(p),
      };
    }),

  /**
   * Two posterior snapshots side by side. This is the memory proof: the same
   * features at week 1 and week N, with the intervals visibly narrowing.
   */
  timeTravel: base
    .input(creatorInput.extend({ fromWeek: z.number().int(), toWeek: z.number().int() }))
    .handler(async ({ input, context }) => {
      const [from, to] = await Promise.all([
        getSnapshot(context.db, input.creatorId, input.fromWeek),
        getSnapshot(context.db, input.creatorId, input.toWeek),
      ]);
      if (!from || !to) throw new Error('snapshot missing for one of the requested weeks');

      const fromM = marginals(from);
      const toM = marginals(to);

      return {
        fromWeek: input.fromWeek,
        toWeek: input.toWeek,
        fromNObs: from.nObs,
        toNObs: to.nObs,
        features: fromM.map((f, i) => ({
          name: f.name,
          fromMean: f.mean,
          fromSd: f.sd,
          toMean: toM[i]!.mean,
          toSd: toM[i]!.sd,
          /** Positive means the model got more certain about this feature. */
          uncertaintyDrop: f.sd - toM[i]!.sd,
        })),
      };
    }),

  snapshotWeeks: base
    .input(creatorInput)
    .handler(({ input, context }) => listSnapshotWeeks(context.db, input.creatorId)),

  /** The experiment ledger, newest first. */
  ledger: base
    .input(creatorInput.extend({ limit: z.number().int().min(1).max(500).default(100) }))
    .handler(async ({ input, context }) => {
      const rows = await closedExperiments(context.db, input.creatorId);
      return rows
        .slice(-input.limit)
        .reverse()
        .map((r) => ({
          experimentId: r.experimentId,
          postId: r.postId,
          title: r.title,
          publishedAt: r.publishedAt,
          reward: r.reward,
          features: activeFeatureNames(r.vector),
        }));
    }),

  /** What the Mind learned, in plain language. */
  learned: base
    .input(creatorInput.extend({ limit: z.number().int().min(1).max(100).default(20) }))
    .handler(({ input, context }) => recentBeliefDiffs(context.db, input.creatorId, input.limit)),

  briefs: base
    .input(creatorInput.extend({ limit: z.number().int().min(1).max(100).default(20) }))
    .handler(({ input, context }) => listBriefs(context.db, input.creatorId, input.limit)),

  gateEvents: base
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .handler(({ input, context }) => listGateEvents(context.db, input.limit)),

  /**
   * Notification log. Includes undelivered rows on purpose: a message that
   * failed to send is shown as failed rather than quietly disappearing.
   */
  notifications: base
    .input(creatorInput.extend({ limit: z.number().int().min(1).max(100).default(20) }))
    .handler(({ input, context }) => listNotifications(context.db, input.creatorId, input.limit)),

  /** Confidence in one named feature, for the brief detail view. */
  featureConfidence: base
    .input(creatorInput.extend({ dimension: z.string(), level: z.string() }))
    .handler(async ({ input, context }) => {
      const p = await getPosterior(context.db, input.creatorId);
      if (!p) throw new Error('no posterior yet for this creator');
      const i = featureIndex(input.dimension, input.level);
      return { name: FEATURE_NAMES[i]!, probPositive: probPositive(p, i) };
    }),

  /**
   * The operational summary — creator state, mind status, learning summary,
   * active experiments, recent belief changes, and the next action. Every
   * number here is a live read; nothing is stored for the dashboard.
   */
  overview: base
    .input(creatorInput)
    .handler(async ({ input, context }) => {
      const { db } = context;
      const c = await getCreator(db, input.creatorId);
      if (!c) throw new Error('uncreated creator');
      const [posterior, posteriorMeta, closed, active, diffs, gate, notifs, cadence] = await Promise.all([
        getPosterior(db, c.id),
        getPosteriorMeta(db, c.id),
        closedExperiments(db, c.id),
        activeExperiments(db, c.id, 5),
        recentBeliefDiffs(db, c.id, 5),
        listGateEvents(db, 3),
        listNotifications(db, c.id, 3),
        cadenceOf(db, c.id),
      ]);

      const ms = posterior ? marginals(posterior) : [];
      const sorted = [...ms].sort((a, b) => b.mean - a.mean);
      const strongestPositive = sorted.find((m) => m.mean > 0) ?? null;
      const strongestNegative = [...sorted].reverse().find((m) => m.mean < 0) ?? null;
      const avgUncertainty = ms.length ? ms.reduce((s, m) => s + m.sd, 0) / ms.length : null;
      const lastMaturationAt = closed.reduce((max, e) => Math.max(max, e.closedAt ?? 0), 0) || null;
      const lastGateAt = gate[0]?.createdAt ?? null;
      const lastNotificationAt = notifs[0]?.createdAt ?? null;

      const nextBrief = (await listBriefs(db, c.id, 1))[0] ?? null;

      return {
        creator: {
          handle: c.handle,
          platform: c.platform,
          niche: c.niche,
          followers: c.followers,
          explorationBudget: c.explorationBudget,
          cadence,
        },
        mind: {
          posteriorVersion: posteriorMeta?.version ?? null,
          posteriorUpdatedAt: posteriorMeta?.updatedAt ?? null,
          lastMaturationAt,
          lastGateAt,
          lastNotificationAt,
        },
        learning: {
          closedCount: closed.length,
          dim: posterior?.d ?? 0,
          nObs: posterior?.nObs ?? 0,
          strongestPositive,
          strongestNegative,
          avgUncertainty,
          shrinkageOwn: posterior ? posterior.nObs / (posterior.nObs + 1 / 0.25) : null,
        },
        active: active.map((e) => ({
          id: e.id,
          title: e.title,
          status: e.status,
          openedAt: e.openedAt,
          nextCheckpointAt: e.nextCheckpointAt,
        })),
        recentChanges: diffs.map((d) => ({
          id: d.id,
          createdAt: d.createdAt,
          experimentId: d.experimentId,
          summary: d.summary,
          deltas: d.deltas,
        })),
        nextAction: nextBrief
          ? {
              id: nextBrief.id,
              headline: nextBrief.headline,
              predictedLift: nextBrief.predictedLift,
              ciLow: nextBrief.ciLow,
              ciHigh: nextBrief.ciHigh,
              isExploratory: nextBrief.isExploratory,
              status: nextBrief.status,
              createdAt: nextBrief.createdAt,
              rationale: nextBrief.rationale,
            }
          : null,
      };
    }),

  /**
   * One experiment, complete: what was published, its feature vector, the
   * confounds the baseline knew about, the raw checkpoints, the stored reward
   * components (actual vs expected vs residual σ), and the belief diffs it
   * caused. This is the audit unit of the whole system.
   */
  experimentDetail: base
    .input(creatorInput.extend({ experimentId: z.number().int().positive() }))
    .handler(async ({ input, context }) => {
      const { db } = context;
      const exp = await getExperimentById(db, input.experimentId);
      if (!exp) throw new Error(`no experiment ${input.experimentId}`);
      const [labels, metrics, diffs] = await Promise.all([
        getFeatureLabels(db, exp.postId),
        metricsForPost(db, exp.postId),
        beliefDiffsForExperiment(db, exp.id),
      ]);
      const ctx = (await confoundContexts(db, exp.creatorId)).get(exp.postId) ?? null;
      return {
        experimentId: exp.id,
        postId: exp.postId,
        status: exp.status,
        openedAt: exp.openedAt,
        nextCheckpointAt: exp.nextCheckpointAt,
        closedAt: exp.closedAt,
        reward: exp.reward,
        rewardComponents: exp.rewardComponents,
        title: exp.title,
        publishedAt: exp.publishedAt,
        features: labels,
        confounds: ctx
          ? {
              followers: ctx.followers,
              daysSinceLastPost: ctx.daysSinceLastPost,
              timeIndex: ctx.timeIndex,
              publishedAt: ctx.publishedAt.toISOString(),
            }
          : null,
        checkpoints: metrics.map((m) => ({
          checkpoint: m.checkpoint,
          views: m.views,
          watchTime: m.watchTime,
          comments: m.comments,
          likes: m.likes,
          followerDelta: m.followerDelta,
          collectedAt: m.collectedAt,
        })),
        beliefDiffs: diffs.map((d) => ({
          id: d.id,
          createdAt: d.createdAt,
          deltas: d.deltas,
          summary: d.summary,
        })),
      };
    }),

  /**
   * Why the model believes one feature: its marginal plus every belief diff
   * that has touched it, split into supporting and against.
   */
  featureExplain: base
    .input(creatorInput.extend({ feature: z.string().min(1) }))
    .handler(async ({ input, context }) => {
      const { db } = context;
      const p = await getPosterior(db, input.creatorId);
      if (!p) throw new Error('no posterior yet for this creator');
      const marginal = marginals(p).find((m) => m.name === input.feature);
      const diffs = await recentBeliefDiffs(db, input.creatorId, 400);
      const touched: Array<{ id: number; experimentId: number | null; createdAt: number; delta: number; summary: string }> = [];
      for (const d of diffs) {
        const arr = d.deltas as Array<{ name: string; delta: number }>;
        const entry = Array.isArray(arr) ? arr.find((e) => e.name === input.feature) : null;
        if (entry && typeof entry.delta === 'number') {
          touched.push({ id: d.id, experimentId: d.experimentId, createdAt: d.createdAt, delta: entry.delta, summary: d.summary });
        }
      }
      const supporting = touched.filter((t) => t.delta > 0).sort((a, b) => b.delta - a.delta);
      const against = touched.filter((t) => t.delta < 0).sort((a, b) => a.delta - b.delta);
      return {
        feature: input.feature,
        marginal: marginal ?? null,
        supporting,
        against,
      };
    }),

  /** The autonomous activity feed: what the system did on its own. */
  activity: base
    .input(creatorInput.extend({ limit: z.number().int().min(1).max(100).default(40) }))
    .handler(async ({ input, context }) => {
      const { db } = context;
      const [diffs, gate, notifs, closed] = await Promise.all([
        recentBeliefDiffs(db, input.creatorId, 40),
        listGateEvents(db, 40),
        listNotifications(db, input.creatorId, 20),
        closedExperiments(db, input.creatorId),
      ]);
      const events: Array<Record<string, unknown>> = [];
      for (const d of diffs) {
        events.push({ type: 'belief_diff', at: d.createdAt, id: d.id, experimentId: d.experimentId, summary: d.summary, deltas: d.deltas });
      }
      for (const g of gate) {
        events.push({ type: 'gate', at: g.createdAt, id: g.id, briefId: g.briefId, rule: g.rule, verdict: g.verdict, explanation: g.explanation });
      }
      for (const n of notifs) {
        events.push({ type: 'notification', at: n.createdAt, id: n.id, channel: n.channel, sentAt: n.sentAt, body: n.body });
      }
      for (const e of closed) {
        events.push({ type: 'experiment_closed', at: e.closedAt ?? 0, experimentId: e.experimentId, title: e.title, reward: e.reward });
      }
      events.sort((a, b) => (b.at as number) - (a.at as number));
      return events.slice(0, input.limit);
    }),

  /** What the creator has said publicly — the canon the gate checks against. */
  claims: base.input(creatorInput).handler(async ({ input, context }) => {
    const rows = await listClaims(context.db, input.creatorId);
    return rows.map((c) => ({
      id: c.id,
      postId: c.postId,
      text: c.text,
      statedAt: c.statedAt,
    }));
  }),

  /**
   * What the Mind remembers: the canon, recurring bits, chosen briefs,
   * notifications, cadence, and the features it is most certain about.
   * Every entry is a real stored row; nothing is generated for display.
   */
  memory: base.input(creatorInput).handler(async ({ input, context }) => {
    const { db } = context;
    const c = await getCreator(db, input.creatorId);
    if (!c) throw new Error('uncreated creator');
    const [claims, bits, briefs, notifs, posterior, cadence] = await Promise.all([
      listClaims(db, c.id),
      listBits(db, c.id),
      listBriefs(db, c.id, 5),
      listNotifications(db, c.id, 5),
      getPosterior(db, c.id),
      cadenceOf(db, c.id),
    ]);
    const ms = posterior ? marginals(posterior) : [];
    const learnedTop = [...ms]
      .sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean))
      .slice(0, 8)
      .map((m) => ({ name: m.name, mean: m.mean, sd: m.sd, probPositive: m.probPositive }));
    return {
      claims: claims.map((cl) => ({ id: cl.id, postId: cl.postId, text: cl.text, statedAt: cl.statedAt })),
      bits: bits.map((b) => ({ id: b.id, name: b.name, description: b.description, lastUsedAt: b.lastUsedAt })),
      briefs: briefs.map((b) => ({
        id: b.id,
        headline: b.headline,
        status: b.status,
        isExploratory: b.isExploratory,
        createdAt: b.createdAt,
      })),
      notifications: notifs.map((n) => ({
        id: n.id,
        channel: n.channel,
        body: n.body,
        sentAt: n.sentAt,
        createdAt: n.createdAt,
      })),
      cadence,
      learnedTop,
    };
  }),
};

export type Router = typeof router;

/** One-hot vector back to the human-readable labels it encodes. */
function activeFeatureNames(x: Float64Array): string[] {
  const out: string[] = [];
  for (let i = 0; i < x.length; i++) if (x[i] !== 0) out.push(FEATURE_NAMES[i]!);
  return out;
}
