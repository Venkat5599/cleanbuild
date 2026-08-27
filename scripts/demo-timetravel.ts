/**
 * The acceptance test, and the demo.
 *
 * SELF-CONTAINED: it needs no prior runs. It creates its own database
 * (.data/demo.db), seeds eight weeks of synthetic history (CHECKLIST B1 —
 * labelled synthetic everywhere it is shown), matures it, and then runs the
 * autonomous path with no browser open and no human in the loop:
 *
 *   1. the act step proposes a brief drawn from the posterior
 *   2. a deliberately contradictory draft is blocked by the Canon Gate
 *   3. a new post is published; the clock advances past 24h, 72h, then 168h
 *   4. the cron job matures the experiment, computes a residual reward, and
 *      folds it into the posterior
 *   5. the belief change clears the materiality gate and a notification is
 *      composed and surfaced
 *   6. the Mind is briefed and follows up (with --deliver and credentials)
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
import { mkdir, rm } from 'node:fs/promises';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate as drizzleMigrate } from 'drizzle-orm/bun-sqlite/migrator';
import { join } from 'node:path';
import {
  FEATURE_SCHEMA_VERSION,
  encode,
  type FeatureLabels,
  type Marginal,
} from '../packages/core/src/index.js';
import { fromFile } from '../packages/db/src/local.js';
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
import {
  fixedClock,
  matureDueExperiments,
  confoundContexts,
  fitCreatorBaseline,
  systemClock,
} from '../packages/pipeline/src/learn.js';
import { generateBrief, headlineOf } from '../packages/pipeline/src/act.js';
import { MindsClient } from '../packages/mind/src/client.js';
import { runFollowUp } from '../apps/api/src/followup.js';
import { residualReward, marginals } from '../packages/core/src/index.js';
import { seed } from './seed-history.js';

// Built conditionally rather than passing `transport: undefined`, which
// `exactOptionalPropertyTypes` correctly rejects.
const logOptions: pino.LoggerOptions = {};
if (process.stdout.isTTY) {
  logOptions.transport = {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss' },
  };
}
const log = pino(logOptions);

const deliver = process.argv.includes('--deliver');
const DB_PATH = '.data/demo.db';

// ---------------------------------------------------------------------------
// 0. Own database, own eight weeks of synthetic history.
// ---------------------------------------------------------------------------
await mkdir('.data', { recursive: true });
// Every run of the acceptance test starts from an empty database. Otherwise a
// prior run's demo-creator, its posts, and its rate-limited notifications leak
// into this one and the hook cooldown / materiality gates fire on stale state
// rather than on what actually happened during this run.
for (const suffix of ['', '-wal', '-shm']) {
  await rm(`${DB_PATH}${suffix}`, { force: true });
}
const sqlite = new Database(DB_PATH, { create: true });
sqlite.exec('PRAGMA foreign_keys = ON');
drizzleMigrate(drizzle(sqlite), {
  migrationsFolder: join(import.meta.dir, '..', 'packages', 'db', 'migrations'),
});
sqlite.close();

const db = fromFile(DB_PATH);
const { creatorId } = await seed(db, {
  weeks: 8,
  postsPerWeek: 5,
  seed: 1337,
  handle: 'demo-creator',
  niche: 'making',
  dbPath: DB_PATH,
  // End the synthetic history 15 days ago so no seeded post sits inside the
  // canon gate's 14-day hook-cooldown horizon. The gate then judges the act
  // round on its merits, and the deliberately contradictory draft is the
  // thing that deserves to be blocked — not every candidate by cadence alone.
  endOffsetDays: 15,
});
const creator = (await listCreators(db))[0]!;
log.info({ creatorId }, 'seeded 8 weeks of synthetic history; experiments open');

// Mature the seeded history so the posterior exists and has something to say.
// Same loop the Worker runs; the only difference is that it is driven now.
for (;;) {
  const results = await matureDueExperiments(db, systemClock, 500);
  if (results.length === 0) break;
}
const before = await getPosterior(db, creator.id);
if (!before) {
  log.error('posterior did not form from seeded history');
  process.exit(1);
}
log.info({ nObs: before.nObs }, 'seeded history matured; posterior formed');

function fmt(m: Marginal): string {
  return `${m.mean >= 0 ? '+' : ''}${m.mean.toFixed(3)} [${m.ciLow.toFixed(2)}, ${m.ciHigh.toFixed(2)}] P(helps)=${(m.probPositive * 100).toFixed(0)}%`;
}

// ---------------------------------------------------------------------------
// 1. The act step proposes the next brief from the posterior.
// ---------------------------------------------------------------------------
const act = await generateBrief(db, creator.id, { seed: 7 });
log.info(
  { headline: act.headline, stance: act.stance, lift: Number(act.predictedLift.toFixed(3)) },
  'act round complete',
);
for (const e of act.gateEvents) {
  log.info({ rule: e.rule, verdict: e.verdict, explanation: e.explanation }, 'gate event');
}

// ---------------------------------------------------------------------------
// 2. The Canon Gate blocks a deliberately contradictory draft.
// ---------------------------------------------------------------------------
// This draft re-asserts the canon claim "I think 20 minute videos are dead
// for this channel" almost word for word. High token overlap against the
// recorded canon is exactly what the contradiction rule is for.
const badLabels: FeatureLabels = {
  hookType: 'question',
  lengthBucket: '20m_plus',
  thumbnailArchetype: 'face_reaction',
  publishSlot: 'weekday_pm',
  format: 'commentary',
  topicCluster: 2,
};
const badAct = await generateBrief(db, creator.id, {
  seed: 8,
  labels: badLabels,
  headlineOverride: '20 minute videos are dead for good',
});
log.info(
  { headline: badAct.headline, stance: badAct.stance },
  'deliberate contradictory draft run through the gate',
);
for (const e of badAct.gateEvents) {
  log.info({ rule: e.rule, verdict: e.verdict, explanation: e.explanation }, 'gate event');
}

// ---------------------------------------------------------------------------
// 3. A creator publishes. Nothing else happens yet; the experiment opens.
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
//
// The materiality gate is deliberately hard to trip: an ordinary post moves
// beliefs slightly and is correctly judged not worth interrupting a human
// over. So the demo post is a genuine breakout — and its size is not a magic
// number. Views are set from this creator's own fitted baseline so the post
// clears its expected performance by TARGET_SIGMA residual standard
// deviations, using the same residualReward math the maturation job scores
// every real post with. The run therefore proves the gate fires on a result
// that deserves to fire, not on a forced one.
const TARGET_SIGMA = 3.9; // a breakout; still under the ±4σ clip
const model = await fitCreatorBaseline(db, creator.id, systemClock);
if (!model) {
  log.error('no baseline model fit on the seeded history');
  process.exit(1);
}
const demoCtx = (await confoundContexts(db, creator.id)).get(postId);
if (!demoCtx) {
  log.error('demo post missing from creator history');
  process.exit(1);
}
const { predictedLogViews, sigmaResid } = residualReward(1, model, demoCtx);
const finalViews = Math.round(Math.exp(predictedLogViews + TARGET_SIGMA * sigmaResid));
log.info(
  {
    predictedLogViews: Number(predictedLogViews.toFixed(2)),
    sigmaResid: Number(sigmaResid.toFixed(2)),
    finalViews,
  },
  `demo post sized to +${TARGET_SIGMA}σ above the creator's fitted baseline`,
);
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
// 4..5. Advance the clock. The job runs itself.
// ---------------------------------------------------------------------------
const minds =
  deliver && process.env.MINDS_BUILDER_API_KEY
    ? new MindsClient({ apiKey: process.env.MINDS_BUILDER_API_KEY as string })
    : null;
const telegram =
  deliver && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
    ? { botToken: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID }
    : null;

if (deliver && !minds && !telegram) {
  log.warn('--deliver passed but no Minds or Telegram credentials are set; storing only');
}

let followUpReport: Awaited<ReturnType<typeof runFollowUp>> | null = null;

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
  followUpReport = await runFollowUp({
    db,
    clock,
    minds,
    mindAlias: process.env.MINDS_ALIAS ?? null,
    telegram,
    log: (event, data) => log.debug({ ...data }, event),
  });

  const detail = followUpReport.details.find((d) => d.experimentId === experimentId);
  log.info(
    {
      at: at.toISOString(),
      closed: followUpReport.closed,
      voided: followUpReport.voided,
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

console.log('\nact round');
console.log(`  proposed : ${act.headline}`);
console.log(`            lift ${act.predictedLift >= 0 ? '+' : ''}${act.predictedLift.toFixed(2)}σ (95% CI ${act.ciLow.toFixed(2)} to ${act.ciHigh.toFixed(2)}) · ${act.stance}`);
console.log(`  blocked  : ${badAct.headline}`);
console.log(`            ${badAct.gateEvents.filter((e) => e.verdict === 'block').map((e) => `[${e.rule}] ${e.explanation}`).join(' ')}`);

const notifications = await listNotifications(db, creator.id, 3);
console.log('\nmost recent notifications');
for (const n of notifications) {
  console.log(
    `  [${n.channel}] ${n.sentAt ? 'delivered ' + new Date(n.sentAt).toISOString() : 'NOT DELIVERED (surfaced, not discarded)'}`,
  );
}

// The claims the submission makes, checked rather than asserted.
const closedThisRun = after.nObs - before.nObs;
const demoDetail = followUpReport?.details.find((d) => d.experimentId === experimentId);
const checks: Array<[string, boolean]> = [
  // Advancing the clock a week matures every experiment that came due, not
  // only the demo one. That is the real behaviour, so the check counts what
  // actually happened rather than assuming a single close.
  ['experiments matured with no human input', closedThisRun >= 1],
  ['posterior changed', moved.length > 0],
  ['uncertainty did not increase', moved.every((x) => x.m.sd <= x.before.sd + 1e-9)],
  [
    'the demo experiment was judged material (cleared the gate on its merits)',
    demoDetail?.material === true,
  ],
  ['a notification was composed and delivered or surfaced', notifications.length > 0],
  ['the act step proposed a brief from the posterior', act.stance === 'proposed'],
  ['the canon gate blocked the deliberately contradictory draft', badAct.stance === 'blocked'],
];

console.log(`\n${closedThisRun} experiment(s) closed during this run.`);

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