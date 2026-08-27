/**
 * Hierarchical pooling across creators (PRD 8.4).
 *
 *   theta_creator ~ N( mu_niche , tau^2 I )
 *
 * This is the cold-start fix and the network effect in one object. A creator on
 * day 1 inherits the niche prior and is useful immediately; as their own
 * evidence accumulates the posterior shrinks toward their data and away from
 * the pool. Every creator who joins sharpens the prior for the next one.
 *
 * Estimator is method-of-moments empirical Bayes: the observed spread of
 * creator means overstates the true spread by exactly the average posterior
 * variance, so we subtract it back out.
 */

import { FEATURE_DIM } from './features.js';
import type { Posterior, Prior } from './posterior.js';

export const MIN_CREATORS_FOR_POOLING = 3;
// The floor is a pseudo-count, not a positivity hack: it caps how much the
// pool may dominate. tau2 = 1e-3 would give the niche prior 1000
// pseudo-observations of weight, collapsing every creator onto the pool mean
// the moment 3 creators exist. tau2 = 0.01 means at most ~100 pseudo-obs,
// so a creator with a full history is always mostly their own data — the
// personalisation property the estimator's own comment promises.
const TAU2_FLOOR = 0.01;

export interface PoolingResult {
  prior: Prior;
  nCreators: number;
  /** False when the niche was too thin and a fallback prior was used. */
  pooled: boolean;
}

/**
 * Estimate the niche prior from per-creator posteriors.
 * Returns `pooled: false` and the supplied fallback when the niche is too thin
 * — a "pooled" prior from two creators is just one creator's noise wearing a
 * population costume.
 */
export function empiricalBayes(
  posteriors: Posterior[],
  fallback: Prior,
  d: number = FEATURE_DIM,
): PoolingResult {
  if (posteriors.length < MIN_CREATORS_FOR_POOLING) {
    return { prior: fallback, nCreators: posteriors.length, pooled: false };
  }

  const n = posteriors.length;
  const mu0 = new Float64Array(d);
  for (const p of posteriors) {
    for (let i = 0; i < d; i++) mu0[i] = mu0[i]! + p.mu[i]! / n;
  }

  // Between-creator variance, per coordinate.
  let betweenSum = 0;
  let withinSum = 0;
  for (let i = 0; i < d; i++) {
    let between = 0;
    let within = 0;
    for (const p of posteriors) {
      const dev = p.mu[i]! - mu0[i]!;
      between += (dev * dev) / (n - 1);
      within += p.sigma[i * p.d + i]! / n;
    }
    betweenSum += between;
    withinSum += within;
  }

  // Observed spread minus average within-creator uncertainty. Floored, because
  // a negative or zero estimate would collapse every creator onto the pooled
  // mean and destroy personalisation.
  const tau2 = Math.max((betweenSum - withinSum) / d, TAU2_FLOOR);

  return { prior: { mu0, tau2 }, nCreators: n, pooled: true };
}

/**
 * Effective weight on the creator's own data versus the niche prior.
 * Surfaced verbatim in the UI as "62% your data, 38% niche prior".
 */
export function poolingWeights(
  nObs: number,
  tau2: number,
  noiseVar = 1,
): { own: number; niche: number } {
  const own = nObs / (nObs + noiseVar / tau2);
  return { own, niche: 1 - own };
}
