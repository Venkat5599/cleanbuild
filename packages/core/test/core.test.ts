import { describe, expect, test } from 'bun:test';
import {
  DESIGN_DIM,
  fitBaseline,
  predictLogViews,
  type BaselineTrainingRow,
} from '../src/baseline.js';
import { blendReward, residualReward } from '../src/reward.js';
import {
  FEATURE_DIM,
  FEATURE_NAMES,
  encode,
  featureIndex,
  lengthBucketOf,
  publishSlotOf,
} from '../src/features.js';
import { cholesky, invSPD, normalCdf, solveSPD, eye } from '../src/linalg.js';
import { createRng } from '../src/rng.js';
import { flatPrior, initFromPrior, recompute, update } from '../src/posterior.js';
import { applyExplorationBudget, rank, sampleTheta, predictiveVariance } from '../src/thompson.js';
import { empiricalBayes, poolingWeights } from '../src/pooling.js';

describe('features', () => {
  test('encodes exactly one coordinate per dimension', () => {
    const x = encode({
      hookType: 'question',
      lengthBucket: '4_10m',
      thumbnailArchetype: 'face_reaction',
      publishSlot: 'weekday_pm',
      format: 'tutorial',
      topicCluster: 2,
    });
    expect(x.length).toBe(FEATURE_DIM);
    expect(FEATURE_DIM).toBe(35);
    expect(x.reduce((a, b) => a + b, 0)).toBe(6);
    expect(x[featureIndex('hook_type', 'question')]).toBe(1);
    expect(x[featureIndex('topic_cluster', 'topic_2')]).toBe(1);
  });

  test('names are index-aligned with the vector', () => {
    expect(FEATURE_NAMES.length).toBe(FEATURE_DIM);
    expect(FEATURE_NAMES[featureIndex('format', 'shorts')]).toBe('format:shorts');
  });

  test('rejects an unknown level rather than silently mis-encoding', () => {
    expect(() =>
      encode({
        // @ts-expect-error deliberately invalid
        hookType: 'not_a_hook',
        lengthBucket: '4_10m',
        thumbnailArchetype: 'none',
        publishSlot: 'weekday_pm',
        format: 'vlog',
        topicCluster: 0,
      }),
    ).toThrow();
  });

  test('buckets durations and publish times', () => {
    expect(lengthBucketOf(45)).toBe('under_60s');
    expect(lengthBucketOf(1500)).toBe('20m_plus');
    // 2026-08-24 is a Monday.
    expect(publishSlotOf(new Date(2026, 7, 24, 9))).toBe('weekday_am');
    expect(publishSlotOf(new Date(2026, 7, 24, 22))).toBe('weekday_late');
    expect(publishSlotOf(new Date(2026, 7, 23, 9))).toBe('weekend_am');
  });
});

describe('linalg', () => {
  test('cholesky and solve invert a known SPD system', () => {
    const A = new Float64Array([4, 2, 2, 3]);
    const L = cholesky(A, 2);
    expect(L).not.toBeNull();
    const x = solveSPD(A, new Float64Array([10, 8]), 2)!;
    expect(x[0]!).toBeCloseTo((4 * 3 - 2 * 2) ** -1 * (3 * 10 - 2 * 8), 10);
    const inv = invSPD(A, 2)!;
    // A * A^-1 = I
    expect(inv[0]! * 4 + inv[2]! * 2).toBeCloseTo(1, 10);
  });

  test('rejects a non positive-definite matrix instead of returning garbage', () => {
    expect(cholesky(new Float64Array([1, 2, 2, 1]), 2)).toBeNull();
    expect(invSPD(eye(2, -1), 2)).toBeNull();
  });

  test('normalCdf matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
});

describe('rng', () => {
  test('is deterministic for a given seed', () => {
    const a = createRng(123);
    const b = createRng(123);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });

  test('normals are roughly standard', () => {
    const rng = createRng(1);
    let sum = 0;
    let sq = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const z = rng.normal();
      sum += z;
      sq += z * z;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.05);
    expect(Math.abs(sq / n - 1)).toBeLessThan(0.05);
  });
});

describe('baseline', () => {
  /** Views generated from confounds only — no creative effect at all. */
  function syntheticRows(n: number, seed: number): BaselineTrainingRow[] {
    const rng = createRng(seed);
    const start = new Date(2026, 5, 1).getTime();
    const rows: BaselineTrainingRow[] = [];
    for (let i = 0; i < n; i++) {
      const publishedAt = new Date(start + i * 2.1 * 86_400_000);
      const timeIndex = (publishedAt.getTime() - start) / 86_400_000;
      const followers = 10_000 * Math.exp(0.004 * timeIndex);
      const daysSinceLastPost = 1 + rng.next() * 4;
      const weekendBoost = [0, 6].includes(publishedAt.getDay()) ? 0.25 : 0;
      const logViews =
        2.0 + 0.8 * Math.log(followers) + weekendBoost - 0.05 * daysSinceLastPost + rng.normal() * 0.2;
      rows.push({
        followers,
        publishedAt,
        daysSinceLastPost,
        timeIndex,
        views: Math.exp(logViews),
      });
    }
    return rows;
  }

  test('returns null rather than a fake fit on too little data', () => {
    expect(fitBaseline(syntheticRows(DESIGN_DIM - 1, 1))).toBeNull();
  });

  test('fits confounds and leaves small residuals', () => {
    const rows = syntheticRows(200, 2);
    const model = fitBaseline(rows)!;
    expect(model).not.toBeNull();
    expect(model.nTrain).toBe(200);
    expect(model.sigmaResid).toBeLessThan(0.5);
    const pred = predictLogViews(model, rows[100]!);
    expect(Math.abs(pred - Math.log(rows[100]!.views))).toBeLessThan(1);
  });

  test('rewards on confound-only data are centred near zero', () => {
    const rows = syntheticRows(200, 3);
    const model = fitBaseline(rows)!;
    const rewards = rows.map((r) => residualReward(r.views, model, r).clipped);
    const mean = rewards.reduce((a, b) => a + b, 0) / rewards.length;
    const sd = Math.sqrt(
      rewards.reduce((a, b) => a + (b - mean) ** 2, 0) / (rewards.length - 1),
    );
    // If this fails the baseline is wrong and every downstream number is
    // meaningless. CHECKLIST C3.
    expect(Math.abs(mean)).toBeLessThan(0.25);
    expect(sd).toBeGreaterThan(0.6);
    expect(sd).toBeLessThan(1.5);
  });
});

describe('reward', () => {
  const model = {
    coefs: new Float64Array(DESIGN_DIM),
    sigmaResid: 0.5,
    nTrain: 100,
    fittedAt: new Date().toISOString(),
    designDim: DESIGN_DIM,
  };
  const ctx = {
    followers: 1000,
    publishedAt: new Date(2026, 7, 24, 12),
    daysSinceLastPost: 2,
    timeIndex: 30,
  };

  test('clips an outlier and flags that it did so', () => {
    const out = residualReward(Math.exp(40), model, ctx);
    expect(out.raw).toBeGreaterThan(4);
    expect(out.clipped).toBe(4);
    expect(out.wasClipped).toBe(true);
  });

  test('leaves an ordinary observation untouched', () => {
    const out = residualReward(Math.exp(1), model, ctx);
    expect(out.wasClipped).toBe(false);
    expect(out.clipped).toBeCloseTo(2, 6);
  });

  test('blending renormalises around missing secondary signals', () => {
    expect(blendReward(1)).toBeCloseTo(1, 10);
    expect(blendReward(1, { retentionZ: 1, commentRateZ: 1, followerDeltaZ: 1 })).toBeCloseTo(1, 10);
    expect(blendReward(1, { retentionZ: -1 })).toBeCloseTo((0.6 - 0.2) / 0.8, 10);
  });
});

describe('thompson', () => {
  const prior = flatPrior();

  function candidateSet() {
    const combos: Array<{ label: string; x: Float64Array }> = [];
    for (const hook of ['question', 'claim', 'contrarian', 'demo_first'] as const) {
      combos.push({
        label: hook,
        x: encode({
          hookType: hook,
          lengthBucket: '4_10m',
          thumbnailArchetype: 'none',
          publishSlot: 'weekday_pm',
          format: 'vlog',
          topicCluster: 0,
        }),
      });
    }
    return combos.map((c) => ({ x: c.x, payload: c.label }));
  }

  test('a single theta draw scores every candidate consistently', () => {
    const p = initFromPrior(prior, FEATURE_DIM);
    const theta = sampleTheta(p, createRng(1));
    const a = rank(p, theta, candidateSet());
    const b = rank(p, theta, candidateSet());
    expect(a.map((r) => r.payload)).toEqual(b.map((r) => r.payload));
    for (let i = 1; i < a.length; i++) {
      expect(a[i - 1]!.score).toBeGreaterThanOrEqual(a[i]!.score);
    }
  });

  test('different seeds explore different candidates', () => {
    const p = initFromPrior(prior, FEATURE_DIM);
    const winners = new Set<string>();
    for (let s = 0; s < 40; s++) {
      const theta = sampleTheta(p, createRng(s));
      winners.add(rank(p, theta, candidateSet())[0]!.payload as string);
    }
    // With a flat prior and no evidence, the agent must not be deterministic.
    expect(winners.size).toBeGreaterThan(1);
  });

  test('evidence pulls the ranking toward the known winner', () => {
    // Evidence has to VARY to separate a hook from its block-mates. Repeating a
    // single identical vector only identifies the sum of its six coordinates,
    // so the hook never pulls away from its siblings however many times it is
    // observed. This mirrors the real ingest: mixed features, one planted edge.
    const rng = createRng(77);
    const hooks = ['question', 'claim', 'contrarian', 'demo_first'] as const;
    const lengths = ['under_60s', '1_4m', '4_10m', '10_20m'] as const;
    const formats = ['tutorial', 'commentary', 'vlog', 'list'] as const;

    let p = initFromPrior(prior, FEATURE_DIM);
    for (let i = 0; i < 300; i++) {
      const hook = hooks[Math.floor(rng.next() * hooks.length)]!;
      const x = encode({
        hookType: hook,
        lengthBucket: lengths[Math.floor(rng.next() * lengths.length)]!,
        thumbnailArchetype: 'none',
        publishSlot: 'weekday_pm',
        format: formats[Math.floor(rng.next() * formats.length)]!,
        topicCluster: Math.floor(rng.next() * 8),
      });
      const truth = hook === 'question' ? 1.0 : 0;
      p = update(p, x, truth + rng.normal() * 0.3, 1);
    }

    let questionWins = 0;
    for (let s = 0; s < 50; s++) {
      const theta = sampleTheta(p, createRng(s + 100));
      if (rank(p, theta, candidateSet())[0]!.payload === 'question') questionWins++;
    }
    expect(questionWins).toBeGreaterThan(45);
  });

  test('predictive variance falls as evidence arrives', () => {
    const p0 = initFromPrior(prior, FEATURE_DIM);
    const x = candidateSet()[0]!.x;
    let p = p0;
    for (let i = 0; i < 50; i++) p = update(p, x, 1, 1);
    expect(predictiveVariance(p, x)).toBeLessThan(predictiveVariance(p0, x));
  });

  test('exploration budget caps exploratory picks', () => {
    const p = initFromPrior(prior, FEATURE_DIM);
    const theta = sampleTheta(p, createRng(4));
    const ranked = rank(p, theta, candidateSet());
    const chosen = applyExplorationBudget(ranked, 4, 0.25);
    expect(chosen.length).toBe(4);
    // Backfill is allowed to exceed the cap only once the pool is exhausted;
    // with 4 candidates and a 25% budget at most 1 may be exploratory first.
    expect(chosen.slice(0, 2).filter((c) => c.isExploratory).length).toBeLessThanOrEqual(1);
  });
});

describe('pooling', () => {
  function creator(seed: number, shift: number) {
    const rng = createRng(seed);
    const X: Float64Array[] = [];
    const r: number[] = [];
    for (let i = 0; i < 60; i++) {
      const x = encode({
        hookType: (['question', 'claim', 'contrarian'] as const)[i % 3]!,
        lengthBucket: '4_10m',
        thumbnailArchetype: 'none',
        publishSlot: 'weekday_pm',
        format: 'vlog',
        topicCluster: i % 8,
      });
      X.push(x);
      r.push(shift * x[featureIndex('hook_type', 'question')]! + rng.normal() * 0.3);
    }
    return recompute(X, Float64Array.from(r), flatPrior(), 1, FEATURE_DIM);
  }

  test('refuses to pool a niche that is too thin', () => {
    const fallback = flatPrior();
    const res = empiricalBayes([creator(1, 0.5), creator(2, 0.6)], fallback);
    expect(res.pooled).toBe(false);
    expect(res.prior).toBe(fallback);
  });

  test('pools a shared effect into the niche prior', () => {
    const res = empiricalBayes(
      [creator(1, 0.8), creator(2, 0.9), creator(3, 0.7), creator(4, 0.85)],
      flatPrior(),
    );
    expect(res.pooled).toBe(true);
    expect(res.nCreators).toBe(4);
    expect(res.prior.mu0[featureIndex('hook_type', 'question')]!).toBeGreaterThan(0.1);
    expect(res.prior.tau2).toBeGreaterThan(0);
  });

  test('shrinkage moves from niche prior toward own data', () => {
    const cold = poolingWeights(0, 0.25);
    const warm = poolingWeights(100, 0.25);
    expect(cold.own).toBe(0);
    expect(cold.niche).toBe(1);
    expect(warm.own).toBeGreaterThan(0.9);
    expect(warm.own + warm.niche).toBeCloseTo(1, 12);
  });
});
