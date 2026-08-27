/**
 * Run the nightly pooling job locally (FR-9).
 *
 * Estimates a niche prior from every creator in each niche whose posterior
 * exists, then persists it to niche_priors. Niches with fewer than three
 * creators keep their fallback prior and are reported as not pooled.
 *
 * Usage:
 *   bun run scripts/seed-history.ts --creators 6 --niches making,tech,gaming,fitness,education,cooking
 *   bun run scripts/verify-recovery.ts
 *   bun run scripts/pool-niches.ts
 */
import pino from 'pino';
import { fromFile } from '../packages/db/src/local.js';
import { poolNiches } from '../packages/pipeline/src/learn.js';

const logOptions: pino.LoggerOptions = {};
if (process.stdout.isTTY) {
  logOptions.transport = {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss' },
  };
}
const log = pino(logOptions);

const db = fromFile('.data/dev.db');
const outcomes = await poolNiches(db);

console.log(`\n${outcomes.length} niche(s) evaluated:`);
for (const o of outcomes) {
  console.log(
    `  ${o.niche.padEnd(12)} creators=${o.creators}  pooled=${o.pooled}  tau2=${o.tau2.toExponential(2)}`,
  );
}
const pooled = outcomes.filter((o) => o.pooled).length;
if (pooled === 0) {
  log.warn('no niche reached the 3-creator threshold — seed with --creators 6');
}
console.log(`${pooled} niche(s) pooled.`);