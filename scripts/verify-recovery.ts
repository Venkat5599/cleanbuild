/**
 * End-to-end verification of the learning path (CHECKLIST C1 and C3).
 *
 * Runs the REAL pipeline over the seeded ledger — no shortcuts, no direct
 * writes to the posterior — and then asserts two things:
 *
 *   C3  rewards are centred near zero with roughly unit spread, which is only
 *       true if the baseline model actually absorbed the confounds
 *   C1  the posterior recovers the ground truth planted by seed-history.ts
 *
 * If C3 fails the baseline is wrong and every number downstream is
 * meaningless, so it is checked first and reported separately.
 *
 * Usage:  bun scripts/verify-recovery.ts
 */

import { DIMENSIONS, FEATURE_NAMES, marginal, featureIndex } from '../packages/core/src/index.js';
import { fromFile } from '../packages/db/src/client.js';
import { closedExperiments, listCreators } from '../packages/db/src/queries.js';
import {
  backfillSnapshots,
  matureDueExperiments,
  refitCreator,
  systemClock,
} from '../packages/pipeline/src/learn.js';
import { PLANTED_EFFECTS, plantedTheta } from './seed-history.js';

/** Only within-block contrasts are identifiable; see posterior.test.ts. */
function centerWithinBlocks(v: Float64Array): Float64Array {
  const out = Float64Array.from(v);
  let off = 0;
  for (const dim of DIMENSIONS) {
    const n = dim.levels.length;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += out[off + i]!;
    mean /= n;
    for (let i = 0; i < n; i++) out[off + i] = out[off + i]! - mean;
    off += n;
  }
  return out;
}

function correlation(a: Float64Array, b: Float64Array): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]! / n;
    mb += b[i]! / n;
  }
  let num = 0;
  let da = 0;
  let dbb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x * x;
    dbb += y * y;
  }
  return num / Math.sqrt(da * dbb);
}

const db = await fromFile('.data/dev.db');
const creators = await listCreators(db);
if (creators.length === 0) {
  console.error('no creators — run: bun scripts/seed-history.ts');
  process.exit(1);
}
const creator = creators[0]!;

// 1. Drive maturation to a fixed point. Each pass advances one checkpoint, so
//    a post needs three passes to reach its 168h close.
let passes = 0;
let closed = 0;
let voided = 0;
for (;;) {
  const results = await matureDueExperiments(db, systemClock, 500);
  if (results.length === 0) break;
  closed += results.filter((r) => r.action === 'closed').length;
  voided += results.filter((r) => r.action === 'voided').length;
  if (++passes > 12) break; // deferred-forever guard
}

// 2. Nightly refit — full solve from the ledger.
const refit = await refitCreator(db, creator.id, systemClock);
const weeks = await backfillSnapshots(db, creator.id);

console.log(`maturation: ${passes} passes, ${closed} closed, ${voided} voided`);
console.log(`refit: ${refit.nClosed} closed experiments, drift ${refit.drift.toExponential(2)}`);
console.log(`snapshots: weeks ${weeks[0]}..${weeks.at(-1)}`);

// --- C3: reward distribution -------------------------------------------------
const ledger = await closedExperiments(db, creator.id);
const rewards = ledger.map((c) => c.reward);
const mean = rewards.reduce((a, b) => a + b, 0) / rewards.length;
const sd = Math.sqrt(rewards.reduce((a, b) => a + (b - mean) ** 2, 0) / (rewards.length - 1));

const c3 = Math.abs(mean) < 0.3 && sd > 0.5 && sd < 1.6;
console.log(`\nC3 reward distribution: mean ${mean.toFixed(3)}, sd ${sd.toFixed(3)}  ${c3 ? 'PASS' : 'FAIL'}`);

// --- C1: signal recovery -----------------------------------------------------
const p = refit.posterior!;
const truth = centerWithinBlocks(plantedTheta());
const learned = centerWithinBlocks(p.mu);
const corr = correlation(truth, learned);

console.log(`\nplanted effect vs recovered posterior:`);
console.log('  feature                              planted   recovered   95% CI            P(>0)');
let signsCorrect = 0;
for (const [dim, level, value] of PLANTED_EFFECTS) {
  const i = featureIndex(dim, level);
  const m = marginal(p, i);
  const centred = learned[i]!;
  const ok = Math.sign(centred) === Math.sign(value);
  if (ok) signsCorrect++;
  console.log(
    `  ${FEATURE_NAMES[i]!.padEnd(36)} ${value.toFixed(2).padStart(6)}   ` +
      `${centred.toFixed(3).padStart(8)}   ` +
      `[${m.ciLow.toFixed(2)}, ${m.ciHigh.toFixed(2)}]`.padEnd(17) +
      ` ${m.probPositive.toFixed(2)}  ${ok ? 'ok' : 'WRONG SIGN'}`,
  );
}

// Correlation across the planted effects only.
//
// The full-vector correlation is reported for honesty but is NOT the gate: 30
// of the 35 true weights are exactly zero, so that statistic is dominated by
// estimation noise around zero rather than by whether the real effects were
// found. What matters is whether the effects that exist are recovered in the
// right direction and the right order.
const plantedTruth = Float64Array.from(PLANTED_EFFECTS.map(([d, l]) => truth[featureIndex(d, l)]!));
const plantedLearned = Float64Array.from(
  PLANTED_EFFECTS.map(([d, l]) => learned[featureIndex(d, l)]!),
);
const plantedCorr = correlation(plantedTruth, plantedLearned);

// The dominant planted effect must also be the strongest thing the model found.
let topIdx = 0;
for (let i = 1; i < learned.length; i++) if (learned[i]! > learned[topIdx]!) topIdx = i;
const topIsQuestion = FEATURE_NAMES[topIdx] === 'hook_type:question';

const c1 = plantedCorr > 0.7 && signsCorrect >= 4 && topIsQuestion;
console.log(
  `\nC1 signal recovery:\n` +
    `  correlation over planted effects : ${plantedCorr.toFixed(3)}  (gate: > 0.70)\n` +
    `  correlation over all 35 weights  : ${corr.toFixed(3)}  (reported, not gated —\n` +
    `      30 of 35 true weights are zero, so this statistic measures noise)\n` +
    `  signs correct                    : ${signsCorrect}/${PLANTED_EFFECTS.length}  (gate: >= 4)\n` +
    `  strongest recovered effect       : ${FEATURE_NAMES[topIdx]}  (gate: hook_type:question)\n` +
    `  ${c1 ? 'PASS' : 'FAIL'}`,
);

// Estimates are systematically smaller than the planted truth. That is the
// hierarchical prior doing its job, not a bug: with ~40 observations per level
// the evidence does not yet justify the full effect size, so the posterior
// shrinks toward the niche prior. The ordering is what the bandit acts on.

console.log(`\nn = ${ledger.length} closed experiments`);
if (!c1 || !c3) {
  console.error('\nVERIFICATION FAILED — do not build on top of this.');
  process.exit(1);
}
console.log('\nVERIFICATION PASSED');
