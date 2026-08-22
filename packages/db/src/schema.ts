/**
 * RATCHET schema — Drizzle over SQLite (Cloudflare D1 in production,
 * a local file for seeding and tests).
 *
 * Design notes that matter:
 *  * `experiments` is the learning ledger. Nothing teaches the posterior except
 *    a row here with status='closed' and a non-null reward.
 *  * `status='void'` is a first-class outcome. A post whose metrics never
 *    arrived is recorded as void and excluded — never imputed, because an
 *    imputed reward silently corrupts every belief downstream.
 *  * `features.schemaVersion` freezes a labelling. Relabelling history under a
 *    new version is allowed; mutating a label in place is not.
 *  * mu/sigma are little-endian Float64 blobs, matching
 *    packages/core/src/posterior.ts serialize/deserialize.
 *  * Timestamps are stored as epoch milliseconds (integer). SQLite has no
 *    timestamptz, and an integer avoids every string-comparison trap.
 */

import { sql } from 'drizzle-orm';
import {
  blob,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const creators = sqliteTable(
  'creators',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    handle: text('handle').notNull(),
    platform: text('platform', { enum: ['youtube', 'x', 'csv'] }).notNull(),
    niche: text('niche').notNull().default('general'),
    followers: integer('followers').notNull().default(0),
    tz: text('tz').notNull().default('UTC'),
    explorationBudget: real('exploration_budget').notNull().default(0.25),
    mindAlias: text('mind_alias'),
    telegramChatId: text('telegram_chat_id'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex('creators_platform_handle_idx').on(t.platform, t.handle)],
);

export const posts = sqliteTable(
  'posts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    creatorId: integer('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    platformPostId: text('platform_post_id').notNull(),
    publishedAt: integer('published_at').notNull(),
    title: text('title').notNull().default(''),
    description: text('description').notNull().default(''),
    url: text('url'),
    durationSeconds: integer('duration_seconds'),
    followersAtPublish: integer('followers_at_publish').notNull().default(0),
    raw: text('raw', { mode: 'json' }).notNull().default(sql`'{}'`),
  },
  (t) => [
    // Idempotency for the poller: re-reading a channel never duplicates a post.
    uniqueIndex('posts_creator_platform_id_idx').on(t.creatorId, t.platformPostId),
    index('posts_creator_published_idx').on(t.creatorId, t.publishedAt),
  ],
);

export const features = sqliteTable('features', {
  postId: integer('post_id')
    .primaryKey()
    .references(() => posts.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull(),
  hookType: text('hook_type').notNull(),
  lengthBucket: text('length_bucket').notNull(),
  thumbnailArchetype: text('thumbnail_archetype').notNull(),
  publishSlot: text('publish_slot').notNull(),
  format: text('format').notNull(),
  topicCluster: integer('topic_cluster').notNull(),
  /** Little-endian Float64, length d. */
  vector: blob('vector', { mode: 'buffer' }).notNull(),
  labeledBy: text('labeled_by').notNull().default('mind'),
  labeledAt: integer('labeled_at').notNull(),
});

export const metrics = sqliteTable(
  'metrics',
  {
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    checkpoint: text('checkpoint', { enum: ['24h', '72h', '168h'] }).notNull(),
    collectedAt: integer('collected_at').notNull(),
    views: integer('views'),
    watchTime: integer('watch_time'),
    comments: integer('comments'),
    likes: integer('likes'),
    followerDelta: integer('follower_delta'),
  },
  (t) => [primaryKey({ columns: [t.postId, t.checkpoint] })],
);

export const experiments = sqliteTable(
  'experiments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    postId: integer('post_id')
      .notNull()
      .unique()
      .references(() => posts.id, { onDelete: 'cascade' }),
    creatorId: integer('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['open', 'maturing', 'closed', 'void'] })
      .notNull()
      .default('open'),
    openedAt: integer('opened_at').notNull(),
    nextCheckpointAt: integer('next_checkpoint_at'),
    closedAt: integer('closed_at'),
    /** Null until the experiment closes. A void experiment never gets one. */
    reward: real('reward'),
    rewardComponents: text('reward_components', { mode: 'json' }),
  },
  (t) => [
    index('experiments_creator_status_idx').on(t.creatorId, t.status),
    index('experiments_due_idx').on(t.nextCheckpointAt),
  ],
);

export const baselines = sqliteTable('baselines', {
  creatorId: integer('creator_id')
    .primaryKey()
    .references(() => creators.id, { onDelete: 'cascade' }),
  fittedAt: integer('fitted_at').notNull(),
  coefs: text('coefs', { mode: 'json' }).notNull(),
  sigmaResid: real('sigma_resid').notNull(),
  nTrain: integer('n_train').notNull(),
  designDim: integer('design_dim').notNull(),
});

export const posteriors = sqliteTable('posteriors', {
  creatorId: integer('creator_id')
    .primaryKey()
    .references(() => creators.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),
  updatedAt: integer('updated_at').notNull(),
  mu: blob('mu', { mode: 'buffer' }).notNull(),
  sigma: blob('sigma', { mode: 'buffer' }).notNull(),
  nObs: integer('n_obs').notNull().default(0),
  dim: integer('dim').notNull(),
});

/** Weekly snapshots power the week-1 vs week-N time-travel view. */
export const posteriorSnapshots = sqliteTable(
  'posterior_snapshots',
  {
    creatorId: integer('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    week: integer('week').notNull(),
    takenAt: integer('taken_at').notNull(),
    mu: blob('mu', { mode: 'buffer' }).notNull(),
    sigma: blob('sigma', { mode: 'buffer' }).notNull(),
    nObs: integer('n_obs').notNull(),
    dim: integer('dim').notNull(),
  },
  (t) => [primaryKey({ columns: [t.creatorId, t.week] })],
);

export const beliefDiffs = sqliteTable(
  'belief_diffs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    creatorId: integer('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    experimentId: integer('experiment_id').references(() => experiments.id),
    createdAt: integer('created_at').notNull(),
    deltas: text('deltas', { mode: 'json' }).notNull(),
    summary: text('summary').notNull().default(''),
  },
  (t) => [index('belief_diffs_creator_idx').on(t.creatorId, t.createdAt)],
);

export const nichePriors = sqliteTable('niche_priors', {
  niche: text('niche').primaryKey(),
  updatedAt: integer('updated_at').notNull(),
  mu: blob('mu', { mode: 'buffer' }).notNull(),
  tau2: real('tau2').notNull(),
  nCreators: integer('n_creators').notNull().default(0),
  pooled: integer('pooled', { mode: 'boolean' }).notNull().default(false),
  dim: integer('dim').notNull(),
});

export const claims = sqliteTable(
  'claims',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    creatorId: integer('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    postId: integer('post_id').references(() => posts.id),
    text: text('text').notNull(),
    /**
     * Little-endian Float32 embedding. D1 has no vector type and no ANN index,
     * so the Canon Gate scans a creator's claims and scores cosine in JS. At a
     * few hundred claims per creator that is microseconds; if a creator ever
     * outgrows it, this column moves to Vectorize.
     */
    embedding: blob('embedding', { mode: 'buffer' }),
    statedAt: integer('stated_at').notNull(),
  },
  (t) => [index('claims_creator_idx').on(t.creatorId, t.statedAt)],
);

export const bits = sqliteTable(
  'bits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    creatorId: integer('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    lastUsedAt: integer('last_used_at'),
  },
  (t) => [uniqueIndex('bits_creator_name_idx').on(t.creatorId, t.name)],
);

export const briefs = sqliteTable('briefs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  creatorId: integer('creator_id')
    .notNull()
    .references(() => creators.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
  headline: text('headline').notNull().default(''),
  features: text('features', { mode: 'json' }).notNull(),
  predictedLift: real('predicted_lift').notNull(),
  ciLow: real('ci_low').notNull(),
  ciHigh: real('ci_high').notNull(),
  rationale: text('rationale').notNull().default(''),
  isExploratory: integer('is_exploratory', { mode: 'boolean' }).notNull().default(false),
  status: text('status', {
    enum: ['proposed', 'blocked', 'accepted', 'published', 'discarded'],
  })
    .notNull()
    .default('proposed'),
});

export const gateEvents = sqliteTable('gate_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  briefId: integer('brief_id')
    .notNull()
    .references(() => briefs.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
  rule: text('rule', { enum: ['contradiction', 'hook_cooldown', 'dead_format'] }).notNull(),
  verdict: text('verdict', { enum: ['pass', 'block'] }).notNull(),
  explanation: text('explanation').notNull().default(''),
  overridden: integer('overridden', { mode: 'boolean' }).notNull().default(false),
});

export const notifications = sqliteTable(
  'notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    creatorId: integer('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
    /** Null means composed but not delivered — surfaced, never silently dropped. */
    sentAt: integer('sent_at'),
    channel: text('channel', { enum: ['mind', 'telegram', 'email'] }).notNull(),
    body: text('body').notNull(),
    trigger: text('trigger', { mode: 'json' }).notNull().default(sql`'{}'`),
  },
  (t) => [index('notifications_creator_idx').on(t.creatorId, t.createdAt)],
);

export type Creator = typeof creators.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Experiment = typeof experiments.$inferSelect;
export type Brief = typeof briefs.$inferSelect;
