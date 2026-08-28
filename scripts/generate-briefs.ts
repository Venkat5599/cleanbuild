/**
 * Populate the briefs ledger and the canon-gate audit log (FR-6 / FR-7).
 *
 * Runs the act step over the verified development database, one decision
 * round per seed with the clock advanced past the hook-cooldown window
 * between rounds, then one deliberately contradictory draft so the gate log
 * contains a real block with its explanation.
 *
 * The briefs and gate events it writes are what the dashboard's /briefs and
 * /gate pages show (the snapshot export includes them).
 *
 * Usage:
 *   bun run scripts/verify-recovery.ts   # first: posterior + snapshots
 *   bun run scripts/generate-briefs.ts
 */
import pino from 'pino';
import { fixedClock, generateBrief } from '../packages/pipeline/src/index.js';
import { fromFile } from '../packages/db/src/local.js';
import { listBriefs, listCreators, listGateEvents } from '../packages/db/src/queries.js';
import type { FeatureLabels } from '../packages/core/src/index.js';

const logOptions: pino.LoggerOptions = {};
if (process.stdout.isTTY) {
  logOptions.transport = {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss' },
  };
}
const log = pino(logOptions);

const db = fromFile('.data/dev.db');
const creators = await listCreators(db);
if (creators.length === 0) {
  log.error('no creators. run: bun run scripts/seed-history.ts && bun run scripts/verify-recovery.ts');
  process.exit(1);
}
const creator = creators[0]!;

// Optional embedding contradiction rule, active only when EMBEDDING_* is set.
const embedCfg =
  process.env.EMBEDDING_BASE_URL && process.env.EMBEDDING_API_KEY && process.env.EMBEDDING_MODEL
    ? {
        baseUrl: process.env.EMBEDDING_BASE_URL,
        apiKey: process.env.EMBEDDING_API_KEY,
        model: process.env.EMBEDDING_MODEL,
      }
    : undefined;
if (embedCfg) log.info('embedding contradiction rule ENABLED (EMBEDDING_* set)');

// Five genuine decision rounds, spaced 15 days apart so hooks leave their
// cooldown window between rounds and each round is judged on its merits.
for (let i = 0; i < 5; i++) {
  const at = new Date(Date.now() + i * 15 * 86_400_000);
  const clock = fixedClock(at);
  const result = await generateBrief(db, creator.id, { clock, seed: i + 1, embedCfg });
  log.info(
    {
      round: i + 1,
      stance: result.stance,
      headline: result.headline.slice(0, 70),
      lift: Number(result.predictedLift.toFixed(2)),
      exploratory: result.isExploratory,
    },
    'brief written',
  );
  for (const e of result.gateEvents) {
    log.debug({ rule: e.rule, verdict: e.verdict }, e.explanation.slice(0, 80));
  }
}

// One deliberately contradictory draft, so the gate log shows a block with an
// explanation rather than an empty page. This draft re-asserts the seeded
// canon claim "I think 20 minute videos are dead for this channel."
const badLabels: FeatureLabels = {
  hookType: 'question',
  lengthBucket: '20m_plus',
  thumbnailArchetype: 'face_reaction',
  publishSlot: 'weekday_pm',
  format: 'commentary',
  topicCluster: 2,
};
const bad = await generateBrief(db, creator.id, {
  seed: 99,
  labels: badLabels,
  headlineOverride: '20 minute videos are dead for good',
  embedCfg,
});
log.info(
  { stance: bad.stance, headline: bad.headline },
  'deliberately contradictory draft run through the gate',
);
for (const e of bad.gateEvents) {
  if (e.verdict === 'block') log.info({ rule: e.rule, explanation: e.explanation }, 'gate block');
}

const briefs = await listBriefs(db, creator.id, 20);
const gate = await listGateEvents(db, 50);
console.log(`\n${briefs.length} briefs, ${gate.length} gate events (${gate.filter((g) => g.verdict === 'block').length} blocks).`);
console.log('briefs:');
for (const b of briefs.slice(0, 8)) {
  console.log(
    `  [${b.status}] ${b.headline.slice(0, 78)} (lift ${b.predictedLift >= 0 ? '+' : ''}${b.predictedLift.toFixed(2)}σ)`,
  );
}