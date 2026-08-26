/**
 * Query layer.
 *
 * Written once against the Drizzle schema and runs unchanged on D1 in a Worker
 * or on bun:sqlite locally.
 */

import { and, asc, desc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import type { BaselineModel, FeatureLabels, Posterior, Prior } from '@ratchet/core';
import { fromBlob, toBlob, type Db } from './client.js';
import {
  baselines,
  beliefDiffs,
  briefs,
  claims,
  creators,
  experiments,
  features,
  gateEvents,
  metrics,
  nichePriors,
  notifications,
  posteriorSnapshots,
  posteriors,
  posts,
} from './schema.js';

export type Checkpoint = '24h' | '72h' | '168h';

export const CHECKPOINT_HOURS: Record<Checkpoint, number> = { '24h': 24, '72h': 72, '168h': 168 };
export const CHECKPOINT_ORDER: Checkpoint[] = ['24h', '72h', '168h'];

/** The checkpoint that follows `c`, or null when `c` is terminal. */
export function nextCheckpoint(c: Checkpoint): Checkpoint | null {
  const i = CHECKPOINT_ORDER.indexOf(c);
  return CHECKPOINT_ORDER[i + 1] ?? null;
}

/** Which checkpoint a due timestamp corresponds to, given when it opened. */
export function checkpointFor(openedAtMs: number, dueAtMs: number): Checkpoint {
  const hours = Math.round((dueAtMs - openedAtMs) / 3_600_000);
  let best: Checkpoint = '24h';
  let bestDelta = Infinity;
  for (const c of CHECKPOINT_ORDER) {
    const delta = Math.abs(CHECKPOINT_HOURS[c] - hours);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = c;
    }
  }
  return best;
}

// ------------------------------------------------------------------ creators

export async function upsertCreator(
  db: Db,
  input: {
    handle: string;
    platform: 'youtube' | 'x' | 'csv';
    niche?: string;
    followers?: number;
    tz?: string;
    mindAlias?: string | null;
    telegramChatId?: string | null;
  },
) {
  const existing = await db
    .select()
    .from(creators)
    .where(and(eq(creators.platform, input.platform), eq(creators.handle, input.handle)))
    .limit(1);

  if (existing[0]) {
    const [row] = await db
      .update(creators)
      .set({
        followers: input.followers ?? existing[0].followers,
        niche: input.niche ?? existing[0].niche,
        tz: input.tz ?? existing[0].tz,
        mindAlias: input.mindAlias ?? existing[0].mindAlias,
        telegramChatId: input.telegramChatId ?? existing[0].telegramChatId,
      })
      .where(eq(creators.id, existing[0].id))
      .returning();
    return row!;
  }

  const [row] = await db
    .insert(creators)
    .values({
      handle: input.handle,
      platform: input.platform,
      niche: input.niche ?? 'general',
      followers: input.followers ?? 0,
      tz: input.tz ?? 'UTC',
      mindAlias: input.mindAlias ?? null,
      telegramChatId: input.telegramChatId ?? null,
      createdAt: Date.now(),
    })
    .returning();
  return row!;
}

export async function getCreator(db: Db, id: number) {
  const rows = await db.select().from(creators).where(eq(creators.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listCreators(db: Db) {
  return db.select().from(creators).orderBy(asc(creators.id));
}

// --------------------------------------------------------------------- posts

export interface PostInput {
  creatorId: number;
  platformPostId: string;
  publishedAt: Date;
  title: string;
  description?: string;
  url?: string | null;
  durationSeconds?: number | null;
  followersAtPublish: number;
  raw?: unknown;
}

/**
 * Idempotent by (creatorId, platformPostId). Re-polling a channel never
 * duplicates a post and never rewrites its publishedAt.
 */
export async function insertPost(
  db: Db,
  input: PostInput,
): Promise<{ id: number; inserted: boolean }> {
  const existing = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(eq(posts.creatorId, input.creatorId), eq(posts.platformPostId, input.platformPostId)),
    )
    .limit(1);
  if (existing[0]) return { id: existing[0].id, inserted: false };

  const [row] = await db
    .insert(posts)
    .values({
      creatorId: input.creatorId,
      platformPostId: input.platformPostId,
      publishedAt: input.publishedAt.getTime(),
      title: input.title,
      description: input.description ?? '',
      url: input.url ?? null,
      durationSeconds: input.durationSeconds ?? null,
      followersAtPublish: input.followersAtPublish,
      raw: input.raw ?? {},
    })
    .returning({ id: posts.id });
  return { id: row!.id, inserted: true };
}

export async function listPosts(db: Db, creatorId: number) {
  return db
    .select()
    .from(posts)
    .where(eq(posts.creatorId, creatorId))
    .orderBy(asc(posts.publishedAt));
}

// ------------------------------------------------------------------ features

export async function insertFeatures(
  db: Db,
  postId: number,
  schemaVersion: number,
  labels: FeatureLabels,
  vector: Float64Array,
  labeledBy = 'mind',
): Promise<void> {
  const existing = await db
    .select({ postId: features.postId })
    .from(features)
    .where(eq(features.postId, postId))
    .limit(1);
  // A label is frozen once written. Relabelling happens under a new
  // schemaVersion, never by mutating history.
  if (existing[0]) return;

  await db.insert(features).values({
    postId,
    schemaVersion,
    hookType: labels.hookType,
    lengthBucket: labels.lengthBucket,
    thumbnailArchetype: labels.thumbnailArchetype,
    publishSlot: labels.publishSlot,
    format: labels.format,
    topicCluster: labels.topicCluster,
    vector: toBlob(vector),
    labeledBy,
    labeledAt: Date.now(),
  });
}

// ------------------------------------------------------------------- metrics

export async function upsertMetrics(
  db: Db,
  postId: number,
  checkpoint: Checkpoint,
  m: {
    views?: number | null;
    watchTime?: number | null;
    comments?: number | null;
    likes?: number | null;
    followerDelta?: number | null;
  },
  collectedAt: Date = new Date(),
): Promise<void> {
  await db
    .insert(metrics)
    .values({
      postId,
      checkpoint,
      collectedAt: collectedAt.getTime(),
      views: m.views ?? null,
      watchTime: m.watchTime ?? null,
      comments: m.comments ?? null,
      likes: m.likes ?? null,
      followerDelta: m.followerDelta ?? null,
    })
    .onConflictDoUpdate({
      target: [metrics.postId, metrics.checkpoint],
      set: {
        collectedAt: collectedAt.getTime(),
        views: m.views ?? null,
        watchTime: m.watchTime ?? null,
        comments: m.comments ?? null,
        likes: m.likes ?? null,
        followerDelta: m.followerDelta ?? null,
      },
    });
}

/**
 * Read the immutable feature labels of one post. Immutable per
 * schema_version, so this is a lookup, never a relabel.
 */
export async function getFeatureLabels(
  db: Db,
  postId: number,
): Promise<FeatureLabels | null> {
  const [row] = await db.select().from(features).where(eq(features.postId, postId)).limit(1);
  if (!row) return null;
  return {
    hookType: row.hookType as FeatureLabels['hookType'],
    lengthBucket: row.lengthBucket as FeatureLabels['lengthBucket'],
    thumbnailArchetype: row.thumbnailArchetype as FeatureLabels['thumbnailArchetype'],
    publishSlot: row.publishSlot as FeatureLabels['publishSlot'],
    format: row.format as FeatureLabels['format'],
    topicCluster: row.topicCluster,
  };
}

export async function getMetric(db: Db, postId: number, checkpoint: Checkpoint) {
  const rows = await db
    .select()
    .from(metrics)
    .where(and(eq(metrics.postId, postId), eq(metrics.checkpoint, checkpoint)))
    .limit(1);
  return rows[0] ?? null;
}

// --------------------------------------------------------------- experiments

export async function openExperiment(
  db: Db,
  postId: number,
  creatorId: number,
  publishedAt: Date,
): Promise<number> {
  const existing = await db
    .select({ id: experiments.id })
    .from(experiments)
    .where(eq(experiments.postId, postId))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const [row] = await db
    .insert(experiments)
    .values({
      postId,
      creatorId,
      status: 'open',
      openedAt: publishedAt.getTime(),
      nextCheckpointAt: publishedAt.getTime() + CHECKPOINT_HOURS['24h'] * 3_600_000,
    })
    .returning({ id: experiments.id });
  return row!.id;
}

/** Experiments whose next checkpoint has come due as of `now`. */
export async function dueExperiments(db: Db, now: Date, limit = 200) {
  return db
    .select()
    .from(experiments)
    .where(
      and(
        inArray(experiments.status, ['open', 'maturing']),
        isNotNull(experiments.nextCheckpointAt),
        lte(experiments.nextCheckpointAt, now.getTime()),
      ),
    )
    .orderBy(asc(experiments.nextCheckpointAt))
    .limit(limit);
}

export async function advanceCheckpoint(
  db: Db,
  experimentId: number,
  nextCheckpointAt: Date,
): Promise<void> {
  await db
    .update(experiments)
    .set({ status: 'maturing', nextCheckpointAt: nextCheckpointAt.getTime() })
    .where(eq(experiments.id, experimentId));
}

export async function closeExperiment(
  db: Db,
  experimentId: number,
  reward: number,
  components: unknown,
  closedAt: Date = new Date(),
): Promise<void> {
  await db
    .update(experiments)
    .set({
      status: 'closed',
      reward,
      rewardComponents: components,
      closedAt: closedAt.getTime(),
      nextCheckpointAt: null,
    })
    .where(eq(experiments.id, experimentId));
}

/** A post whose metrics never arrived is voided, never imputed. */
export async function voidExperiment(
  db: Db,
  experimentId: number,
  reason: string,
): Promise<void> {
  await db
    .update(experiments)
    .set({
      status: 'void',
      nextCheckpointAt: null,
      closedAt: Date.now(),
      rewardComponents: { voided: reason },
    })
    .where(eq(experiments.id, experimentId));
}

export interface ClosedExperiment {
  experimentId: number;
  postId: number;
  reward: number;
  vector: Float64Array;
  publishedAt: number;
  title: string;
}

/** Training set for the nightly posterior recompute. */
export async function closedExperiments(
  db: Db,
  creatorId: number,
): Promise<ClosedExperiment[]> {
  const rows = await db
    .select({
      experimentId: experiments.id,
      postId: experiments.postId,
      reward: experiments.reward,
      vector: features.vector,
      publishedAt: posts.publishedAt,
      title: posts.title,
    })
    .from(experiments)
    .innerJoin(features, eq(features.postId, experiments.postId))
    .innerJoin(posts, eq(posts.id, experiments.postId))
    .where(and(eq(experiments.creatorId, creatorId), eq(experiments.status, 'closed')))
    .orderBy(asc(posts.publishedAt));

  return rows.map((r) => ({
    experimentId: r.experimentId,
    postId: r.postId,
    reward: r.reward!,
    vector: fromBlob(r.vector as unknown as Uint8Array),
    publishedAt: r.publishedAt,
    title: r.title,
  }));
}

/** Rows for the baseline fit: confounds plus the 168h view count. */
export async function baselineRows(db: Db, creatorId: number) {
  return db
    .select({
      postId: posts.id,
      publishedAt: posts.publishedAt,
      followersAtPublish: posts.followersAtPublish,
      views: metrics.views,
    })
    .from(posts)
    .innerJoin(
      metrics,
      and(eq(metrics.postId, posts.id), eq(metrics.checkpoint, '168h')),
    )
    .where(and(eq(posts.creatorId, creatorId), isNotNull(metrics.views)))
    .orderBy(asc(posts.publishedAt));
}

// ----------------------------------------------------------------- baselines

export async function putBaseline(db: Db, creatorId: number, model: BaselineModel) {
  await db
    .insert(baselines)
    .values({
      creatorId,
      fittedAt: Date.now(),
      coefs: Array.from(model.coefs),
      sigmaResid: model.sigmaResid,
      nTrain: model.nTrain,
      designDim: model.designDim,
    })
    .onConflictDoUpdate({
      target: baselines.creatorId,
      set: {
        fittedAt: Date.now(),
        coefs: Array.from(model.coefs),
        sigmaResid: model.sigmaResid,
        nTrain: model.nTrain,
        designDim: model.designDim,
      },
    });
}

export async function getBaseline(db: Db, creatorId: number): Promise<BaselineModel | null> {
  const rows = await db
    .select()
    .from(baselines)
    .where(eq(baselines.creatorId, creatorId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    coefs: Float64Array.from(r.coefs as number[]),
    sigmaResid: r.sigmaResid,
    nTrain: r.nTrain,
    designDim: r.designDim,
    fittedAt: new Date(r.fittedAt).toISOString(),
  };
}

// ---------------------------------------------------------------- posteriors

export async function putPosterior(db: Db, creatorId: number, p: Posterior) {
  await db
    .insert(posteriors)
    .values({
      creatorId,
      updatedAt: Date.now(),
      mu: toBlob(p.mu),
      sigma: toBlob(p.sigma),
      nObs: p.nObs,
      dim: p.d,
    })
    .onConflictDoUpdate({
      target: posteriors.creatorId,
      set: {
        updatedAt: Date.now(),
        mu: toBlob(p.mu),
        sigma: toBlob(p.sigma),
        nObs: p.nObs,
        dim: p.d,
        version: sql`${posteriors.version} + 1`,
      },
    });
}

export async function getPosterior(db: Db, creatorId: number): Promise<Posterior | null> {
  const rows = await db
    .select()
    .from(posteriors)
    .where(eq(posteriors.creatorId, creatorId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    mu: fromBlob(r.mu as unknown as Uint8Array),
    sigma: fromBlob(r.sigma as unknown as Uint8Array),
    nObs: r.nObs,
    d: r.dim,
  };
}

export async function putSnapshot(db: Db, creatorId: number, week: number, p: Posterior) {
  await db
    .insert(posteriorSnapshots)
    .values({
      creatorId,
      week,
      takenAt: Date.now(),
      mu: toBlob(p.mu),
      sigma: toBlob(p.sigma),
      nObs: p.nObs,
      dim: p.d,
    })
    .onConflictDoUpdate({
      target: [posteriorSnapshots.creatorId, posteriorSnapshots.week],
      set: {
        takenAt: Date.now(),
        mu: toBlob(p.mu),
        sigma: toBlob(p.sigma),
        nObs: p.nObs,
      },
    });
}

export async function getSnapshot(
  db: Db,
  creatorId: number,
  week: number,
): Promise<Posterior | null> {
  const rows = await db
    .select()
    .from(posteriorSnapshots)
    .where(and(eq(posteriorSnapshots.creatorId, creatorId), eq(posteriorSnapshots.week, week)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    mu: fromBlob(r.mu as unknown as Uint8Array),
    sigma: fromBlob(r.sigma as unknown as Uint8Array),
    nObs: r.nObs,
    d: r.dim,
  };
}

export async function listSnapshotWeeks(db: Db, creatorId: number): Promise<number[]> {
  const rows = await db
    .select({ week: posteriorSnapshots.week })
    .from(posteriorSnapshots)
    .where(eq(posteriorSnapshots.creatorId, creatorId))
    .orderBy(asc(posteriorSnapshots.week));
  return rows.map((r) => r.week);
}

export async function insertBeliefDiff(
  db: Db,
  creatorId: number,
  experimentId: number | null,
  deltas: unknown,
  summary: string,
): Promise<number> {
  const [row] = await db
    .insert(beliefDiffs)
    .values({ creatorId, experimentId, createdAt: Date.now(), deltas, summary })
    .returning({ id: beliefDiffs.id });
  return row!.id;
}

export async function recentBeliefDiffs(db: Db, creatorId: number, limit = 20) {
  return db
    .select()
    .from(beliefDiffs)
    .where(eq(beliefDiffs.creatorId, creatorId))
    .orderBy(desc(beliefDiffs.createdAt))
    .limit(limit);
}

// --------------------------------------------------------------- niche prior

export async function putNichePrior(
  db: Db,
  niche: string,
  prior: Prior,
  nCreators: number,
  pooled: boolean,
) {
  const values = {
    updatedAt: Date.now(),
    mu: toBlob(prior.mu0),
    tau2: prior.tau2,
    nCreators,
    pooled,
    dim: prior.mu0.length,
  };
  await db
    .insert(nichePriors)
    .values({ niche, ...values })
    .onConflictDoUpdate({ target: nichePriors.niche, set: values });
}

export async function getNichePrior(
  db: Db,
  niche: string,
): Promise<{ prior: Prior; nCreators: number; pooled: boolean } | null> {
  const rows = await db.select().from(nichePriors).where(eq(nichePriors.niche, niche)).limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    prior: { mu0: fromBlob(r.mu as unknown as Uint8Array), tau2: r.tau2 },
    nCreators: r.nCreators,
    pooled: r.pooled,
  };
}

// --------------------------------------------------------------------- canon

export async function insertClaim(
  db: Db,
  input: {
    creatorId: number;
    postId?: number | null;
    text: string;
    embedding?: Float64Array | null;
    statedAt: Date;
  },
): Promise<number> {
  const [row] = await db
    .insert(claims)
    .values({
      creatorId: input.creatorId,
      postId: input.postId ?? null,
      text: input.text,
      embedding: input.embedding ? toBlob(input.embedding) : null,
      statedAt: input.statedAt.getTime(),
    })
    .returning({ id: claims.id });
  return row!.id;
}

export async function listClaims(db: Db, creatorId: number) {
  const rows = await db
    .select()
    .from(claims)
    .where(eq(claims.creatorId, creatorId))
    .orderBy(desc(claims.statedAt));
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    statedAt: new Date(r.statedAt),
    postId: r.postId,
    embedding: r.embedding ? fromBlob(r.embedding as unknown as Uint8Array) : null,
  }));
}

// -------------------------------------------------------------------- briefs

export async function insertBrief(
  db: Db,
  input: {
    creatorId: number;
    headline: string;
    features: FeatureLabels;
    predictedLift: number;
    ciLow: number;
    ciHigh: number;
    rationale: string;
    isExploratory: boolean;
  },
): Promise<number> {
  const [row] = await db
    .insert(briefs)
    .values({ ...input, createdAt: Date.now() })
    .returning({ id: briefs.id });
  return row!.id;
}

export async function setBriefStatus(
  db: Db,
  briefId: number,
  status: 'proposed' | 'blocked' | 'accepted' | 'published' | 'discarded',
) {
  await db.update(briefs).set({ status }).where(eq(briefs.id, briefId));
}

export async function listBriefs(db: Db, creatorId: number, limit = 20) {
  return db
    .select()
    .from(briefs)
    .where(eq(briefs.creatorId, creatorId))
    .orderBy(desc(briefs.createdAt))
    .limit(limit);
}

export async function insertGateEvent(
  db: Db,
  input: {
    briefId: number;
    rule: 'contradiction' | 'hook_cooldown' | 'dead_format';
    verdict: 'pass' | 'block';
    explanation: string;
  },
) {
  await db.insert(gateEvents).values({ ...input, createdAt: Date.now() });
}

export async function listGateEvents(db: Db, limit = 50) {
  return db.select().from(gateEvents).orderBy(desc(gateEvents.createdAt)).limit(limit);
}

// ------------------------------------------------------------- notifications

export async function insertNotification(
  db: Db,
  input: {
    creatorId: number;
    channel: 'mind' | 'telegram' | 'email';
    body: string;
    trigger: unknown;
    sentAt?: Date | null;
  },
): Promise<number> {
  const [row] = await db
    .insert(notifications)
    .values({
      creatorId: input.creatorId,
      channel: input.channel,
      body: input.body,
      trigger: input.trigger,
      createdAt: Date.now(),
      sentAt: input.sentAt?.getTime() ?? null,
    })
    .returning({ id: notifications.id });
  return row!.id;
}

export async function markNotificationSent(db: Db, id: number, sentAt: Date = new Date()) {
  await db.update(notifications).set({ sentAt: sentAt.getTime() }).where(eq(notifications.id, id));
}

/** Most recent delivered notification — backs the 1-per-24h rate limit. */
export async function lastNotificationAt(db: Db, creatorId: number): Promise<Date | null> {
  const rows = await db
    .select({ sentAt: notifications.sentAt })
    .from(notifications)
    .where(and(eq(notifications.creatorId, creatorId), isNotNull(notifications.sentAt)))
    .orderBy(desc(notifications.sentAt))
    .limit(1);
  return rows[0]?.sentAt ? new Date(rows[0].sentAt) : null;
}

export async function listNotifications(db: Db, creatorId: number, limit = 20) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.creatorId, creatorId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}
