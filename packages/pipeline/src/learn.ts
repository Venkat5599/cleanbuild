/**
 * The learning loop.
 *
 * This module is the seam between the ledger and the beliefs. It is shared by
 * the Cloudflare cron worker and the local demo script, so the autonomous path
 * exercised in the demo is byte-for-byte the one that runs in production.
 *
 * Two entry points:
 *   matureDueExperiments()  — the hourly job. Collects a checkpoint, and on the
 *                             168h close computes the reward and folds it into
 *                             the posterior incrementally.
 *   refitCreator()          — the nightly job. Refits the baseline and rebuilds
 *                             the posterior from the ledger with a full solve,
 *                             clearing drift accumulated by rank-1 updates.
 */

import {
  DEFAULT_NOISE_VAR,
  FEATURE_DIM,
  beliefDiff,
  fitBaseline,
  flatPrior,
  initFromPrior,
  marginal,
  recompute,
  residualReward,
  update,
  type BaselineModel,
  type BaselineTrainingRow,
  type BeliefDelta,
  type ConfoundContext,
  type Posterior,
  type Prior,
} from '@ratchet/core';
import {
  CHECKPOINT_HOURS,
  advanceCheckpoint,
  baselineRows,
  checkpointFor,
  closeExperiment,
  closedExperiments,
  dueExperiments,
  getBaseline,
  getCreator,
  getMetric,
  getNichePrior,
  getPosterior,
  insertBeliefDiff,
  listPosts,
  nextCheckpoint,
  putBaseline,
  putPosterior,
  putSnapshot,
  voidExperiment,
  type Checkpoint,
  type Db,
} from '@ratchet/db';

/** Injectable clock. The demo advances it; production passes the real one. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(at: Date): Clock {
  return { now: () => at };
}

// ---------------------------------------------------------------- confounds

/**
 * Build the confound context for a post. `daysSinceLastPost` and `timeIndex`
 * are relative to the creator's own history, so they are computed here rather
 * than stored — a backfilled post would otherwise carry a stale gap.
 */
export async function confoundContexts(
  db: Db,
  creatorId: number,
): Promise<Map<number, ConfoundContext & { views?: number }>> {
  const rows = await listPosts(db, creatorId);
  const out = new Map<number, ConfoundContext & { views?: number }>();
  if (rows.length === 0) return out;

  const firstMs = rows[0]!.publishedAt;
  let prevMs: number | null = null;

  for (const r of rows) {
    const publishedAt = new Date(r.publishedAt);
    out.set(r.id, {
      followers: r.followersAtPublish,
      publishedAt,
      daysSinceLastPost:
        prevMs === null ? 3 : Math.max(0.25, (r.publishedAt - prevMs) / 86_400_000),
      timeIndex: (r.publishedAt - firstMs) / 86_400_000,
    });
    prevMs = r.publishedAt;
  }
  return out;
}

/** Fit the baseline from every post that has a 168h view count. */
export async function fitCreatorBaseline(
  db: Db,
  creatorId: number,
  clock: Clock = systemClock,
): Promise<BaselineModel | null> {
  const ctxs = await confoundContexts(db, creatorId);
  const rows = await baselineRows(db, creatorId);

  const training: BaselineTrainingRow[] = [];
  for (const r of rows) {
    const ctx = ctxs.get(r.postId);
    if (!ctx || r.views == null) continue;
    training.push({ ...ctx, views: r.views });
  }

  const model = fitBaseline(training, { now: clock.now() });
  if (model) await putBaseline(db, creatorId, model);
  return model;
}

// ------------------------------------------------------------------- priors

async function priorFor(db: Db, creatorId: number): Promise<Prior> {
  const creator = await getCreator(db, creatorId);
  if (!creator) return flatPrior();
  const niche = await getNichePrior(db, creator.niche);
  return niche?.prior ?? flatPrior();
}

async function posteriorFor(db: Db, creatorId: number): Promise<Posterior> {
  const stored = await getPosterior(db, creatorId);
  if (stored) return stored;
  // Cold start: begin at the niche prior, never at zero-with-no-uncertainty.
  return initFromPrior(await priorFor(db, creatorId), FEATURE_DIM);
}

// -------------------------------------------------------------- maturation

export interface MaturationResult {
  experimentId: number;
  postId: number;
  creatorId: number;
  checkpoint: Checkpoint;
  action: 'collected' | 'closed' | 'voided' | 'deferred';
  reward?: number;
  deltas?: BeliefDelta[];
  summary?: string;
}

/**
 * Advance every experiment whose checkpoint is due.
 *
 * Metrics are assumed already collected into the `metrics` table by the ingest
 * layer. When the 168h row is missing the experiment is VOIDED, not imputed:
 * a fabricated reward is indistinguishable from a real one once it is in the
 * posterior, and it corrupts every belief that follows.
 */
export async function matureDueExperiments(
  db: Db,
  clock: Clock = systemClock,
  limit = 200,
): Promise<MaturationResult[]> {
  const now = clock.now();
  const due = await dueExperiments(db, now, limit);
  const results: MaturationResult[] = [];

  // Baselines are per creator and cheap to reuse across a batch.
  const baselineCache = new Map<number, BaselineModel | null>();
  const contextCache = new Map<number, Map<number, ConfoundContext>>();

  for (const exp of due) {
    const checkpoint = checkpointFor(exp.openedAt, exp.nextCheckpointAt!);
    const metric = await getMetric(db, exp.postId, checkpoint);

    if (!metric || metric.views == null) {
      if (checkpoint === '168h') {
        await voidExperiment(db, exp.id, `no metrics at ${checkpoint}`);
        results.push({
          experimentId: exp.id,
          postId: exp.postId,
          creatorId: exp.creatorId,
          checkpoint,
          action: 'voided',
        });
      } else {
        // Missing an early checkpoint is not fatal — try again at the next one.
        const next = nextCheckpoint(checkpoint);
        if (next) {
          await advanceCheckpoint(
            db,
            exp.id,
            new Date(exp.openedAt + CHECKPOINT_HOURS[next] * 3_600_000),
          );
        }
        results.push({
          experimentId: exp.id,
          postId: exp.postId,
          creatorId: exp.creatorId,
          checkpoint,
          action: 'deferred',
        });
      }
      continue;
    }

    if (checkpoint !== '168h') {
      // Provisional signal: recorded and displayed, never learned from.
      const next = nextCheckpoint(checkpoint)!;
      await advanceCheckpoint(
        db,
        exp.id,
        new Date(exp.openedAt + CHECKPOINT_HOURS[next] * 3_600_000),
      );
      results.push({
        experimentId: exp.id,
        postId: exp.postId,
        creatorId: exp.creatorId,
        checkpoint,
        action: 'collected',
      });
      continue;
    }

    // --- 168h close: this is the only event that teaches ------------------
    if (!baselineCache.has(exp.creatorId)) {
      const stored = await getBaseline(db, exp.creatorId);
      baselineCache.set(exp.creatorId, stored ?? (await fitCreatorBaseline(db, exp.creatorId, clock)));
    }
    const model = baselineCache.get(exp.creatorId) ?? null;
    if (!model) {
      // Not enough history to know what "expected" means yet. Defer rather
      // than invent a baseline — the nightly refit will pick it up.
      results.push({
        experimentId: exp.id,
        postId: exp.postId,
        creatorId: exp.creatorId,
        checkpoint,
        action: 'deferred',
      });
      continue;
    }

    if (!contextCache.has(exp.creatorId)) {
      contextCache.set(exp.creatorId, await confoundContexts(db, exp.creatorId));
    }
    const ctx = contextCache.get(exp.creatorId)!.get(exp.postId);
    if (!ctx) {
      await voidExperiment(db, exp.id, 'post missing from creator history');
      results.push({
        experimentId: exp.id,
        postId: exp.postId,
        creatorId: exp.creatorId,
        checkpoint,
        action: 'voided',
      });
      continue;
    }

    const components = residualReward(metric.views, model, ctx);
    await closeExperiment(db, exp.id, components.clipped, components, now);

    // Fold the observation into the posterior and record what moved.
    const closed = await closedExperiments(db, exp.creatorId);
    const thisOne = closed.find((c) => c.experimentId === exp.id);
    const before = await posteriorFor(db, exp.creatorId);
    const after = thisOne
      ? update(before, thisOne.vector, components.clipped, DEFAULT_NOISE_VAR)
      : before;
    await putPosterior(db, exp.creatorId, after);

    const deltas = beliefDiff(before, after);
    const summary = summariseDeltas(deltas, components.clipped);
    await insertBeliefDiff(db, exp.creatorId, exp.id, deltas, summary);

    results.push({
      experimentId: exp.id,
      postId: exp.postId,
      creatorId: exp.creatorId,
      checkpoint,
      action: 'closed',
      reward: components.clipped,
      deltas,
      summary,
    });
  }

  return results;
}

/** Plain-language belief change. The dashboard and the Mind both read this. */
export function summariseDeltas(deltas: BeliefDelta[], reward: number): string {
  if (deltas.length === 0) return 'No measurable change in beliefs.';
  const top = deltas.slice(0, 3);
  const direction = reward >= 0 ? 'beat' : 'missed';
  const parts = top.map(
    (d) => `${d.name} ${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(3)}`,
  );
  return `Post ${direction} its baseline by ${Math.abs(reward).toFixed(2)}σ. Moved: ${parts.join(', ')}.`;
}

// ---------------------------------------------------------------- refitting

export interface RefitResult {
  creatorId: number;
  nClosed: number;
  baselineFitted: boolean;
  /** Max absolute divergence between incremental and recomputed means. */
  drift: number;
  posterior: Posterior | null;
}

/**
 * Nightly: refit the baseline, then rebuild the posterior from the ledger with
 * a full Cholesky solve. The divergence from the incrementally-maintained
 * posterior is reported as a health metric rather than hidden — a growing
 * drift is the early warning that the rank-1 path has a bug.
 */
export async function refitCreator(
  db: Db,
  creatorId: number,
  clock: Clock = systemClock,
): Promise<RefitResult> {
  const model = await fitCreatorBaseline(db, creatorId, clock);
  const closed = await closedExperiments(db, creatorId);

  if (closed.length === 0) {
    return { creatorId, nClosed: 0, baselineFitted: !!model, drift: 0, posterior: null };
  }

  const prior = await priorFor(db, creatorId);
  const X = closed.map((c) => c.vector);
  const r = Float64Array.from(closed.map((c) => c.reward));
  const rebuilt = recompute(X, r, prior, DEFAULT_NOISE_VAR, FEATURE_DIM);

  const incremental = await getPosterior(db, creatorId);
  let drift = 0;
  if (incremental && incremental.d === rebuilt.d) {
    for (let i = 0; i < rebuilt.d; i++) {
      drift = Math.max(drift, Math.abs(incremental.mu[i]! - rebuilt.mu[i]!));
    }
  }

  await putPosterior(db, creatorId, rebuilt);
  return { creatorId, nClosed: closed.length, baselineFitted: !!model, drift, posterior: rebuilt };
}

/**
 * Write a weekly posterior snapshot. These back the week-1 vs week-N view,
 * which is how memory is demonstrated rather than asserted.
 */
export async function snapshotWeek(
  db: Db,
  creatorId: number,
  week: number,
): Promise<Posterior | null> {
  const p = await getPosterior(db, creatorId);
  if (!p) return null;
  await putSnapshot(db, creatorId, week, p);
  return p;
}

/**
 * Rebuild the posterior week by week over the closed ledger, writing a
 * snapshot after each week. Used once after backfilling history so the
 * time-travel view has something to show on day one.
 */
export async function backfillSnapshots(db: Db, creatorId: number): Promise<number[]> {
  const closed = await closedExperiments(db, creatorId);
  if (closed.length === 0) return [];

  const prior = await priorFor(db, creatorId);
  const startMs = closed[0]!.publishedAt;
  const weeks: number[] = [];

  let p = initFromPrior(prior, FEATURE_DIM);
  let cursor = 0;
  const lastWeek = Math.floor((closed.at(-1)!.publishedAt - startMs) / (7 * 86_400_000)) + 1;

  for (let week = 1; week <= lastWeek; week++) {
    const cutoff = startMs + week * 7 * 86_400_000;
    while (cursor < closed.length && closed[cursor]!.publishedAt < cutoff) {
      p = update(p, closed[cursor]!.vector, closed[cursor]!.reward, DEFAULT_NOISE_VAR);
      cursor++;
    }
    await putSnapshot(db, creatorId, week, p);
    weeks.push(week);
  }
  return weeks;
}

/** Top features by effect size, for the dashboard and the Mind's context. */
export function topFeatures(p: Posterior, n = 5) {
  return Array.from({ length: p.d }, (_, i) => marginal(p, i))
    .sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean))
    .slice(0, n);
}
