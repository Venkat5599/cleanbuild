import { describe, expect, test } from 'bun:test';
import {
  DIMENSIONS,
  FEATURE_DIM,
  FEATURE_NAMES,
  encode,
  featureIndex,
  type FeatureLabels,
} from '../src/features.js';
import {
  beliefDiff,
  deserialize,
  flatPrior,
  initFromPrior,
  marginal,
  recompute,
  serialize,
  update,
  type Posterior,
} from '../src/posterior.js';
import { createRng } from '../src/rng.js';

/**
 * The one-hot design has 6 blocks that each sum to 1, so the overall level is
 * shared five times over and absolute weights are not identifiable — only
 * contrasts *within* a block are. Every recovery assertion therefore compares
 * block-centred vectors, which is the quantity the model can actually learn.
 */
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
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return num / Math.sqrt(da * db);
}

/** Ground truth planted by `scripts/seed-history.ts`. */
function plantedTheta(): Float64Array {
  const t = new Float64Array(FEATURE_DIM);
  t[featureIndex('hook_type', 'question')] = 0.6;
  t[featureIndex('hook_type', 'contrarian')] = 0.25;
  t[featureIndex('length_bucket', '20m_plus')] = -0.4;
  t[featureIndex('thumbnail_archetype', 'face_reaction')] = 0.3;
  t[featureIndex('format', 'shorts')] = -0.2;
  return t;
}

function randomLabels(rng: { next(): number }): FeatureLabels {
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng.next() * arr.length)]!;
  return {
    hookType: pick(DIMENSIONS[0]!.levels) as FeatureLabels['hookType'],
    lengthBucket: pick(DIMENSIONS[1]!.levels) as FeatureLabels['lengthBucket'],
    thumbnailArchetype: pick(DIMENSIONS[2]!.levels) as FeatureLabels['thumbnailArchetype'],
    publishSlot: pick(DIMENSIONS[3]!.levels) as FeatureLabels['publishSlot'],
    format: pick(DIMENSIONS[4]!.levels) as FeatureLabels['format'],
    topicCluster: Math.floor(rng.next() * 8),
  };
}

function simulate(n: number, seed: number, noiseSd: number) {
  const rng = createRng(seed);
  const theta = plantedTheta();
  const X: Float64Array[] = [];
  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = encode(randomLabels(rng));
    let mean = 0;
    for (let j = 0; j < FEATURE_DIM; j++) mean += theta[j]! * x[j]!;
    X.push(x);
    r[i] = mean + rng.normal() * noiseSd;
  }
  return { X, r, theta };
}

describe('posterior', () => {
  test('T-303 recovers the planted signal from seeded history', () => {
    const { X, r, theta } = simulate(400, 42, 0.5);
    const prior = flatPrior(FEATURE_DIM, 0.25);
    const p = recompute(X, r, prior, 1, FEATURE_DIM);

    const truth = centerWithinBlocks(theta);
    const learned = centerWithinBlocks(p.mu);

    // Direction of the whole belief vector must match the truth.
    expect(correlation(truth, learned)).toBeGreaterThan(0.9);

    // The specific claims the demo makes on screen.
    const best = FEATURE_NAMES[learned.indexOf(Math.max(...learned))];
    expect(best).toBe('hook_type:question');

    expect(p.mu[featureIndex('hook_type', 'question')]!).toBeGreaterThan(
      p.mu[featureIndex('hook_type', 'demo_first')]!,
    );
    expect(p.mu[featureIndex('length_bucket', '20m_plus')]!).toBeLessThan(
      p.mu[featureIndex('length_bucket', '4_10m')]!,
    );
    expect(p.mu[featureIndex('thumbnail_archetype', 'face_reaction')]!).toBeGreaterThan(
      p.mu[featureIndex('thumbnail_archetype', 'none')]!,
    );
  });

  test('is confident about the winning hook after enough evidence', () => {
    const { X, r } = simulate(400, 7, 0.5);
    const p = recompute(X, r, flatPrior(), 1, FEATURE_DIM);
    const m = marginal(p, featureIndex('hook_type', 'question'));
    expect(m.probPositive).toBeGreaterThan(0.9);
    expect(m.ciLow).toBeLessThan(m.mean);
    expect(m.ciHigh).toBeGreaterThan(m.mean);
  });

  test('incremental updates agree with the nightly recompute', () => {
    const { X, r } = simulate(150, 11, 0.5);
    const prior = flatPrior();
    let p: Posterior = initFromPrior(prior, FEATURE_DIM);
    for (let i = 0; i < X.length; i++) p = update(p, X[i]!, r[i]!, 1);
    const full = recompute(X, r, prior, 1, FEATURE_DIM);

    for (let i = 0; i < FEATURE_DIM; i++) {
      expect(Math.abs(p.mu[i]! - full.mu[i]!)).toBeLessThan(1e-8);
      expect(Math.abs(p.sigma[i * FEATURE_DIM + i]! - full.sigma[i * FEATURE_DIM + i]!)).toBeLessThan(
        1e-8,
      );
    }
    expect(p.nObs).toBe(full.nObs);
  });

  test('posterior variance is monotonically non-increasing', () => {
    const { X, r } = simulate(60, 3, 0.5);
    let p = initFromPrior(flatPrior(), FEATURE_DIM);
    let prev = Array.from({ length: FEATURE_DIM }, (_, i) => p.sigma[i * FEATURE_DIM + i]!);
    for (let k = 0; k < X.length; k++) {
      p = update(p, X[k]!, r[k]!, 1);
      for (let i = 0; i < FEATURE_DIM; i++) {
        const v = p.sigma[i * FEATURE_DIM + i]!;
        expect(v).toBeLessThanOrEqual(prev[i]! + 1e-12);
        expect(v).toBeGreaterThan(0);
        prev[i] = v;
      }
    }
  });

  test('a vanishing tau2 pins the posterior to the prior', () => {
    const { X, r } = simulate(100, 5, 0.5);
    const mu0 = new Float64Array(FEATURE_DIM).fill(0.123);
    const p = recompute(X, r, { mu0, tau2: 1e-9 }, 1, FEATURE_DIM);
    for (let i = 0; i < FEATURE_DIM; i++) {
      expect(Math.abs(p.mu[i]! - 0.123)).toBeLessThan(1e-4);
    }
  });

  test('an extreme single observation cannot dominate (clipping is upstream)', () => {
    const prior = flatPrior();
    const x = encode({
      hookType: 'question',
      lengthBucket: '4_10m',
      thumbnailArchetype: 'none',
      publishSlot: 'weekday_pm',
      format: 'vlog',
      topicCluster: 0,
    });
    const p = update(initFromPrior(prior, FEATURE_DIM), x, 4, 1);
    // With tau2=0.25 and 6 active coordinates, a single +4 reward moves each
    // active weight by well under the raw reward — the prior is doing its job.
    expect(p.mu[featureIndex('hook_type', 'question')]!).toBeLessThan(1);
    expect(p.mu[featureIndex('hook_type', 'question')]!).toBeGreaterThan(0);
  });

  test('belief diff reports what moved and in what order', () => {
    const before = initFromPrior(flatPrior(), FEATURE_DIM);
    const x = encode({
      hookType: 'contrarian',
      lengthBucket: 'under_60s',
      thumbnailArchetype: 'face_reaction',
      publishSlot: 'weekend_pm',
      format: 'shorts',
      topicCluster: 3,
    });
    const after = update(before, x, 2.5, 1);
    const diff = beliefDiff(before, after);

    expect(diff.length).toBe(6); // exactly the six active coordinates
    expect(diff.every((d) => d.delta > 0)).toBe(true);
    expect(diff.every((d) => d.sdAfter < d.sdBefore)).toBe(true);
    for (let i = 1; i < diff.length; i++) {
      expect(Math.abs(diff[i - 1]!.delta)).toBeGreaterThanOrEqual(Math.abs(diff[i]!.delta));
    }
  });

  test('serialisation round-trips exactly', () => {
    const { X, r } = simulate(30, 9, 0.5);
    const p = recompute(X, r, flatPrior(), 1, FEATURE_DIM);
    const blob = serialize(p);
    const back = deserialize(blob.mu, blob.sigma, p.nObs);
    expect(back.d).toBe(p.d);
    for (let i = 0; i < FEATURE_DIM; i++) expect(back.mu[i]).toBe(p.mu[i]);
    expect(back.sigma[0]).toBe(p.sigma[0]);
  });
});
