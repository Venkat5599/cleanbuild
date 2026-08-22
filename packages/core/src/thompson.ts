/**
 * Thompson sampling over the creative posterior (PRD 8.3).
 *
 * CORRECTNESS NOTE, and this is the bug that silently ruins the whole system:
 * draw ONE theta per decision round and score every candidate against that
 * single draw. Drawing a fresh theta per candidate is not Thompson sampling —
 * it is argmax over independent noise, which systematically picks whichever
 * candidate got the luckiest draw and destroys the exploration guarantee.
 * `rank()` therefore takes an already-drawn theta rather than an RNG.
 */

import { cholesky, dot } from './linalg.js';
import type { RNG } from './rng.js';
import type { Posterior } from './posterior.js';

/** Draw theta ~ N(mu, Sigma) via the Cholesky factor: theta = mu + L z. */
export function sampleTheta(p: Posterior, rng: RNG): Float64Array {
  const d = p.d;
  let L = cholesky(p.sigma, d);
  if (!L) {
    // Numerically degenerate covariance: nudge the diagonal and retry once.
    // Preferable to throwing inside the act loop — but the caller should log it.
    const jittered = Float64Array.from(p.sigma);
    for (let i = 0; i < d; i++) jittered[i * d + i] = jittered[i * d + i]! + 1e-9;
    L = cholesky(jittered, d);
    if (!L) throw new Error('posterior covariance is not positive-definite');
  }
  const z = new Float64Array(d);
  for (let i = 0; i < d; i++) z[i] = rng.normal();

  const theta = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    let s = p.mu[i]!;
    for (let k = 0; k <= i; k++) s += L[i * d + k]! * z[k]!;
    theta[i] = s;
  }
  return theta;
}

/** Predictive variance of a candidate: x' Sigma x. High means "we don't know". */
export function predictiveVariance(p: Posterior, x: Float64Array): number {
  const d = p.d;
  let s = 0;
  for (let i = 0; i < d; i++) {
    const xi = x[i]!;
    if (xi === 0) continue;
    for (let j = 0; j < d; j++) {
      const xj = x[j]!;
      if (xj !== 0) s += xi * p.sigma[i * d + j]! * xj;
    }
  }
  return s;
}

/** Expected lift under the posterior mean, with a 95% credible interval. */
export function predictedLift(
  p: Posterior,
  x: Float64Array,
): { mean: number; sd: number; ciLow: number; ciHigh: number } {
  const mean = dot(p.mu, x);
  const sd = Math.sqrt(Math.max(predictiveVariance(p, x), 0));
  return { mean, sd, ciLow: mean - 1.96 * sd, ciHigh: mean + 1.96 * sd };
}

export interface Candidate<T = unknown> {
  x: Float64Array;
  payload: T;
}

export interface Ranked<T = unknown> {
  payload: T;
  x: Float64Array;
  /** Score under the single sampled theta — the Thompson score. */
  score: number;
  /** Posterior-mean lift and credible interval, for display only. */
  lift: { mean: number; sd: number; ciLow: number; ciHigh: number };
  predictiveVariance: number;
  isExploratory: boolean;
}

export interface RankOptions {
  /** Fraction of candidates counted as exploratory. Default: top quartile. */
  exploratoryQuantile?: number;
}

/**
 * Rank candidates against ONE sampled theta.
 * `isExploratory` marks candidates whose predictive variance sits above the
 * quantile cut — the policy layer uses this to enforce the exploration budget.
 */
export function rank<T>(
  p: Posterior,
  theta: Float64Array,
  candidates: Candidate<T>[],
  opts: RankOptions = {},
): Ranked<T>[] {
  if (candidates.length === 0) return [];
  const q = opts.exploratoryQuantile ?? 0.75;

  const vars = candidates.map((c) => predictiveVariance(p, c.x));
  const sorted = [...vars].sort((a, b) => a - b);
  const cutIdx = Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)));
  const cut = sorted[cutIdx]!;

  return candidates
    .map((c, i) => ({
      payload: c.payload,
      x: c.x,
      score: dot(theta, c.x),
      lift: predictedLift(p, c.x),
      predictiveVariance: vars[i]!,
      isExploratory: vars[i]! > cut,
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Enforce the exploration budget (FR-6.3).
 *
 * Takes the Thompson ranking and returns the top `n` under the constraint that
 * at most `budget` of them are exploratory — an unconstrained bandit will
 * happily burn a real creator's channel on exploration, which is a product
 * failure even when it is the mathematically optimal move.
 */
export function applyExplorationBudget<T>(
  ranked: Ranked<T>[],
  n: number,
  budget: number,
): Ranked<T>[] {
  const maxExploratory = Math.floor(n * budget);
  const out: Ranked<T>[] = [];
  let usedExploratory = 0;
  for (const r of ranked) {
    if (out.length >= n) break;
    if (r.isExploratory) {
      if (usedExploratory >= maxExploratory) continue;
      usedExploratory++;
    }
    out.push(r);
  }
  // If the budget starved the list, backfill with whatever is left, in order.
  if (out.length < n) {
    for (const r of ranked) {
      if (out.length >= n) break;
      if (!out.includes(r)) out.push(r);
    }
  }
  return out;
}
