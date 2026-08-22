/**
 * Bayesian linear posterior over creative features (PRD 8.3).
 *
 *   r_i = theta' x_i + noise,   noise ~ N(0, noiseVar)
 *   theta ~ N(mu0, tau^2 I)        (mu0 = niche prior)
 *
 * Posterior:
 *   Sigma = ( X'X / noiseVar + Lambda0 )^-1
 *   mu    = Sigma ( X'r / noiseVar + Lambda0 mu0 )
 *
 * Two update paths, deliberately:
 *   - `update`    rank-1 Sherman-Morrison, run live as each experiment closes
 *   - `recompute` full Cholesky solve, run nightly to clear accumulated drift
 * Divergence between the two is a health metric, not a bug to hide.
 */

import {
  eye,
  invSPD,
  matVec,
  normalCdf,
  solveSPD,
  type Mat,
  type Vec,
} from './linalg.js';
import { FEATURE_DIM, FEATURE_NAMES } from './features.js';

export const DEFAULT_NOISE_VAR = 1; // rewards are z-scores, so unit variance
export const DEFAULT_TAU2 = 0.25;

export interface Posterior {
  /** Posterior mean, length d. */
  mu: Float64Array;
  /** Posterior covariance, row-major d*d. */
  sigma: Float64Array;
  /** Number of closed experiments folded in. */
  nObs: number;
  d: number;
}

export interface Prior {
  mu0: Float64Array;
  tau2: number;
}

export function flatPrior(d: number = FEATURE_DIM, tau2: number = DEFAULT_TAU2): Prior {
  return { mu0: new Float64Array(d), tau2 };
}

/** Initialise straight from a prior — this is the cold-start path (FR-1.4). */
export function initFromPrior(prior: Prior, d: number = FEATURE_DIM): Posterior {
  if (prior.mu0.length !== d) throw new Error(`prior dim ${prior.mu0.length} != ${d}`);
  return {
    mu: Float64Array.from(prior.mu0),
    sigma: eye(d, prior.tau2),
    nObs: 0,
    d,
  };
}

/**
 * Rank-1 incremental update (recursive least squares / Kalman form):
 *
 *   k     = Sigma x / (noiseVar + x' Sigma x)
 *   mu'   = mu + k (r - x' mu)
 *   Sigma'= Sigma - k x' Sigma
 *
 * Returns a new Posterior; the input is not mutated.
 */
export function update(
  p: Posterior,
  x: Vec,
  r: number,
  noiseVar: number = DEFAULT_NOISE_VAR,
): Posterior {
  const d = p.d;
  const Sx = matVec(p.sigma, x, d); // Sigma x
  let xSx = 0;
  for (let i = 0; i < d; i++) xSx += x[i]! * Sx[i]!;
  const denom = noiseVar + xSx;

  let xMu = 0;
  for (let i = 0; i < d; i++) xMu += x[i]! * p.mu[i]!;
  const innovation = r - xMu;

  const mu = new Float64Array(d);
  for (let i = 0; i < d; i++) mu[i] = p.mu[i]! + (Sx[i]! * innovation) / denom;

  const sigma = new Float64Array(d * d);
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      sigma[i * d + j] = p.sigma[i * d + j]! - (Sx[i]! * Sx[j]!) / denom;
    }
  }
  // Symmetrise — float error otherwise breaks later Cholesky calls.
  for (let i = 0; i < d; i++) {
    for (let j = i + 1; j < d; j++) {
      const v = 0.5 * (sigma[i * d + j]! + sigma[j * d + i]!);
      sigma[i * d + j] = v;
      sigma[j * d + i] = v;
    }
  }

  return { mu, sigma, nObs: p.nObs + 1, d };
}

/**
 * Full recompute from the ledger. Authoritative; run nightly.
 * Throws only if the system is genuinely degenerate, which cannot happen while
 * tau2 > 0 because Lambda0 keeps the precision matrix positive-definite.
 */
export function recompute(
  X: Float64Array[],
  r: Float64Array,
  prior: Prior,
  noiseVar: number = DEFAULT_NOISE_VAR,
  d: number = FEATURE_DIM,
): Posterior {
  if (X.length !== r.length) throw new Error('X and r length mismatch');

  const lambda0 = 1 / prior.tau2;
  const A: Mat = eye(d, lambda0); // precision
  const b: Vec = new Float64Array(d);
  for (let i = 0; i < d; i++) b[i] = lambda0 * prior.mu0[i]!;

  for (let k = 0; k < X.length; k++) {
    const x = X[k]!;
    const rk = r[k]!;
    for (let i = 0; i < d; i++) {
      const xi = x[i]!;
      if (xi === 0) continue; // one-hot vectors are 6/35 dense
      b[i] = b[i]! + (xi * rk) / noiseVar;
      for (let j = 0; j < d; j++) {
        const xj = x[j]!;
        if (xj !== 0) A[i * d + j] = A[i * d + j]! + (xi * xj) / noiseVar;
      }
    }
  }

  const mu = solveSPD(A, b, d);
  const sigma = invSPD(A, d);
  if (!mu || !sigma) throw new Error('posterior precision matrix is not positive-definite');
  return { mu, sigma, nObs: X.length, d };
}

export interface Marginal {
  index: number;
  name: string;
  mean: number;
  sd: number;
  /** 95% credible interval. Never render a point estimate without it. */
  ciLow: number;
  ciHigh: number;
  probPositive: number;
}

export function marginal(p: Posterior, i: number): Marginal {
  const mean = p.mu[i]!;
  const sd = Math.sqrt(Math.max(p.sigma[i * p.d + i]!, 0));
  return {
    index: i,
    name: FEATURE_NAMES[i] ?? `feature_${i}`,
    mean,
    sd,
    ciLow: mean - 1.96 * sd,
    ciHigh: mean + 1.96 * sd,
    probPositive: sd > 0 ? normalCdf(mean / sd) : mean > 0 ? 1 : 0,
  };
}

export function marginals(p: Posterior): Marginal[] {
  return Array.from({ length: p.d }, (_, i) => marginal(p, i));
}

export function probPositive(p: Posterior, i: number): number {
  return marginal(p, i).probPositive;
}

/** Shrinkage weight: how much of the belief is the creator's own data (FR-9.3). */
export function shrinkage(p: Posterior, prior: Prior, noiseVar = DEFAULT_NOISE_VAR): number {
  // Each one-hot coordinate is observed on average nObs * (blocks/d) times;
  // the standard conjugate weight is n / (n + noiseVar/tau2).
  const nEff = p.nObs;
  return nEff / (nEff + noiseVar / prior.tau2);
}

export interface BeliefDelta {
  index: number;
  name: string;
  before: number;
  after: number;
  delta: number;
  sdBefore: number;
  sdAfter: number;
}

/** What moved, by how much. This is the audit trail and the demo centrepiece. */
export function beliefDiff(before: Posterior, after: Posterior, minDelta = 1e-4): BeliefDelta[] {
  const out: BeliefDelta[] = [];
  for (let i = 0; i < after.d; i++) {
    const b = before.mu[i]!;
    const a = after.mu[i]!;
    if (Math.abs(a - b) < minDelta) continue;
    out.push({
      index: i,
      name: FEATURE_NAMES[i] ?? `feature_${i}`,
      before: b,
      after: a,
      delta: a - b,
      sdBefore: Math.sqrt(Math.max(before.sigma[i * before.d + i]!, 0)),
      sdAfter: Math.sqrt(Math.max(after.sigma[i * after.d + i]!, 0)),
    });
  }
  return out.sort((p, q) => Math.abs(q.delta) - Math.abs(p.delta));
}

/** Serialise for the `bytea` columns. Little-endian Float64. */
export function serialize(p: Posterior): { mu: Uint8Array; sigma: Uint8Array } {
  return {
    mu: new Uint8Array(p.mu.buffer.slice(0)),
    sigma: new Uint8Array(p.sigma.buffer.slice(0)),
  };
}

export function deserialize(mu: Uint8Array, sigma: Uint8Array, nObs: number): Posterior {
  const muArr = new Float64Array(mu.buffer.slice(mu.byteOffset, mu.byteOffset + mu.byteLength));
  const sigArr = new Float64Array(
    sigma.buffer.slice(sigma.byteOffset, sigma.byteOffset + sigma.byteLength),
  );
  const d = muArr.length;
  if (sigArr.length !== d * d) throw new Error('sigma/mu dimension mismatch');
  return { mu: muArr, sigma: sigArr, nObs, d };
}
