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
  closedExperiments,
  getCreator,
  getNichePrior,
  getPosterior,
  getSnapshot,
  listBriefs,
  listCreators,
  listGateEvents,
  listNotifications,
  listSnapshotWeeks,
  recentBeliefDiffs,
  type Db,
} from '@ratchet/db';
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
};

export type Router = typeof router;

/** One-hot vector back to the human-readable labels it encodes. */
function activeFeatureNames(x: Float64Array): string[] {
  const out: string[] = [];
  for (let i = 0; i < x.length; i++) if (x[i] !== 0) out.push(FEATURE_NAMES[i]!);
  return out;
}
