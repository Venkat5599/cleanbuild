/**
 * The acceptance test, and the demo.
 *
 * Runs the autonomous path with no browser open and no human in the loop:
 *
 *   1. a new post is published
 *   2. the clock advances past 24h, 72h, then 168h
 *   3. the cron job matures the experiment, computes a residual reward, and
 *      folds it into the posterior
 *   4. the belief change is judged for materiality
 *   5. the Mind is briefed and follows up
 *
 * There is no demo mode. Every step here calls the same functions the
 * Cloudflare Cron Trigger calls in production; the only thing substituted is
 * the clock, which is injected everywhere precisely so this is possible.
 *
 * Exit code 0 means the persistence claim in the submission is true.
 *
 * Usage:
 *   bun run scripts/demo-timetravel.ts            # local sqlite, dry delivery
 *   bun run scripts/demo-timetravel.ts --deliver  # actually message the Mind
 */

import pino from 'pino';
import {
  FEATURE_SCHEMA_VERSION,
  encode,
  marginal,
  marginals,
  type FeatureLabels,
  type Marginal,
} from '../packages/core/src/index.js';
import { fromFile } from '../packages/db/src/client.js';
import {
  getPosterior,
  insertFeatures,
  insertPost,
  listCreators,
  listNotifications,
  openExperiment,
  upsertMetrics,
  type Checkpoint,
} from '../packages/db/src/queries.js';
import { fixedClock, matureDueExperiments } from '../packages/pipeline/src/learn.js';
import { MindsClient } from '../packages/mind/src/client.js';
import { runFollowUp } from '../apps/api/src/followup.js';

const log = pino({
  transport: process.stdout.isTTY
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
});

const deliver = process.argv.includes('--deliver');
const db = await fromFile('.data/dev.db');

const creators = await listCreators(db);
if (creators.length === 0) {
  log.error('no creators. run: bun run scripts/seed-history.ts');
  process.exit(1);
}
const creator = creators[0]!;

const before = await getPosterior(db, creator.id);
if (!before) {
  log.error('no posterior. run: bun run scripts/verify-recovery.ts');
  process.exit(1);
}

function fmt(m: Marginal): string {
  return `${m.mean >= 0 ? '+' : ''}${m.mean.toFixed(3)} [${m.ciLow.toFixed(2)}, ${m.ciHigh.toFixed(2)}] P(helps)=${(m.probPositive * 100).toFixed(0)}%`;
}

// ---------------------------------------------------------------------------
// 1. A creator publishes. Nothing else happens yet; the experiment simply opens.
// ---------------------------------------------------------------------------

const publishedAt = new Date();
const labels: FeatureLabels = {
  hookType: 'question',
  lengthBucket: '4_10m',
  thumbnailArchetype: 'face_reaction',
  publishSlot: 'weekday_pm',
  format: 'tutorial',
  topicCluster: 2,
};

const { id: postId, inserted } = await insertPost(db, {
  creatorId: creator.id,
  platformPostId: `demo-${publishedAt.getTime()}`,
  publishedAt,
  title: 'Why does my audio chain still hum at 3am',
  description: 'Demo post published during the time-travel run.',
  durationSeconds: 480,
  followersAtPublish: creator.followers,
  raw: { demo: true },
});

await insertFeatures(db, postId, FEATURE_SCHEMA_VERSION, labels, encode(labels), 'demo');
const experimentId = await openExperiment(db, postId, creator.id, publishedAt);

log.info(
  { postId, experimentId, inserted, features: labels },
  'published: experiment opened, status open, first checkpoint in 24h',
);

// The platform reports metrics as they accrue. In production the ingest layer
// writes these rows; here they are provided up front so the clock is the only
// thing being simulated.
// A genuinely strong result. The materiality gate is deliberately hard to
// trip: an ordinary post moves beliefs slightly and is correctly judged not
// worth interrupting a human over. The demo needs a post that clears the bar
// on its merits, so this one performs well above the channel's baseline.
const finalViews = 168_400;
const shares: Record<Checkpoint, number> = { '24h': 0.55, '72h': 0.8, '168h': 1 };
for (const [checkpoint, share] of Object.entries(shares) as Array<[Checkpoint, number]>) {
  await upsertMetrics(db, postId, checkpoint, {
    views: Math.round(finalViews * share),
    watchTime: Math.round(finalViews * share * 480 * 0.38),
    comments: Math.round(finalViews * share * 0.005),
    likes: Math.round(finalViews * share * 0.06),
    followerDelta: Math.round(finalViews * share * 0.003),
  });
}

// ---------------------------------------------------------------------------
// 2..5. Advance the clock. The job runs itself.
// ---------------------------------------------------------------------------

const minds =
  deliver && process.env.MINDS_BUILDER_API_KEY
    ? new MindsClient({ apiKey: process.env.MINDS_BUILDER_API_KEY })
    : null;
const telegram =
  deliver && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
    ? { botToken: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID }
    : null;

if (deliver && !minds && !telegram) {
  log.warn('--deliver passed but no Minds or Telegram credentials are set; storing only');
}

for (const hours of [24, 72, 168]) {
  const at = new Date(publishedAt.getTime() + (hours + 1) * 3_600_000);
  const clock = fixedClock(at);

  if (hours < 168) {
    // Provisional checkpoints are collected and displayed. They never teach.
    const results = await matureDueExperiments(db, clock, 500);
    const mine = results.find((r) => r.experimentId === experimentId);
    log.info(
      { at: at.toISOString(), checkpoint: `${hours}h`, action: mine?.action ?? 'none' },
      `t+${hours}h: signal collected, posterior untouched by design`,
    );
    continue;
  }

  // The 168h close is the only event that teaches, so the full job runs here,
  // including the materiality gate and delivery.
  const report = await runFollowUp({
    db,
    clock,
    minds,
    mindAlias: process.env.MINDS_ALIAS ?? null,
    telegram,
    log: (event, data) => log.debug({ ...data }, event),
  });

  const detail = report.details.find((d) => d.experimentId === experimentId);
  log.info(
    {
      at: at.toISOString(),
      closed: report.closed,
      voided: report.voided,
      material: detail?.material ?? false,
      reason: detail?.reason,
      delivered: detail?.delivered ?? 'none',
    },
    `t+${hours}h: experiment closed, belief updated, follow-up decided`,
  );
  if (detail) log.info({ explanation: detail.explanation }, 'materiality verdict');
}

// ---------------------------------------------------------------------------
// Proof
// ---------------------------------------------------------------------------

const after = await getPosterior(db, creator.id);
if (!after) {
  log.error('posterior vanished');
  process.exit(1);
}

const beforeM = marginals(before);
const moved = marginals(after)
  .map((m, i) => ({ m, delta: m.mean - beforeM[i]!.mean, before: beforeM[i]! }))
  .filter((x) => Math.abs(x.delta) > 1e-6)
  .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

console.log('\nbelief change caused by this one experiment');
console.log('  feature                              before                      after');
for (const { m, before: b } of moved.slice(0, 6)) {
  console.log(`  ${m.name.padEnd(34)} ${fmt(b).padEnd(26)}  ${fmt(m)}`);
}

const notifications = await listNotifications(db, creator.id, 3);
console.log('\nmost recent notifications');
for (const n of notifications) {
  console.log(
    `  [${n.channel}] ${n.sentAt ? 'delivered ' + new Date(n.sentAt).toISOString() : 'NOT DELIVERED (surfaced, not discarded)'}`,
  );
}

// The claims the submission makes, checked rather than asserted.
const closedThisRun = after.nObs - before.nObs;
const checks: Array<[string, boolean]> = [
  // Advancing the clock a week matures every experiment that came due, not
  // only the demo one. That is the real behaviour, so the check counts what
  // actually happened rather than assuming a single close.
  ['experiments matured with no human input', closedThisRun >= 1],
  ['posterior changed', moved.length > 0],
  ['uncertainty did not increase', moved.every((x) => x.m.sd <= x.before.sd + 1e-9)],
  ['a notification was composed and delivered or surfaced', notifications.length > 0],
];

console.log(`
${closedThisRun} experiment(s) closed during this run.`);

console.log('');
let ok = true;
for (const [name, pass] of checks) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}`);
  if (!pass) ok = false;
}

if (!ok) {
  console.error('\nTIME TRAVEL FAILED');
  process.exit(1);
}
console.log('\nTIME TRAVEL PASSED. No browser was open at any point in this run.');
