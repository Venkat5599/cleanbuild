/**
 * Baseline confound model (PRD 8.2).
 *
 * This is the piece that makes the whole system honest. Raw views are
 * confounded by follower growth, day-of-week, time-of-day, posting cadence and
 * channel-level trend. Feeding raw views to the bandit teaches the creator the
 * wrong lesson — that whatever they happened to post during a growth spurt was
 * good. So we first predict what this post was *expected* to do given only
 * non-creative context, and let the bandit learn from the surprise.
 *
 * Weighted ridge regression, recency-weighted with a 90-day half-life.
 */

import { solveSPD, type Mat, type Vec } from './linalg.js';

export interface ConfoundContext {
  /** Follower count at publish time. */
  followers: number;
  /** Local publish timestamp. */
  publishedAt: Date;
  /** Gap since the creator's previous post, in days. */
  daysSinceLastPost: number;
  /** Days since the creator's first observed post — captures channel trend. */
  timeIndex: number;
}

export interface BaselineTrainingRow extends ConfoundContext {
  views: number;
}

export interface BaselineModel {
  coefs: Float64Array;
  sigmaResid: number;
  nTrain: number;
  fittedAt: string;
  /** Design-matrix width, stored so a schema change is detectable. */
  designDim: number;
}

export interface FitOptions {
  halfLifeDays?: number;
  lambda?: number;
  /** Reference date for recency weighting. Defaults to the latest row. */
  now?: Date;
}

const HOUR_BUCKETS = 4; // 0-6, 6-12, 12-18, 18-24
const DOW_LEVELS = 7;

/**
 * Design row layout:
 *   [0]                intercept
 *   [1]                log(followers)
 *   [2]                daysSinceLastPost
 *   [3]                timeIndex
 *   [4 .. 9]           day-of-week one-hot, Sunday dropped as reference
 *   [10 .. 12]         hour bucket one-hot, first bucket dropped as reference
 */
export const DESIGN_DIM = 4 + (DOW_LEVELS - 1) + (HOUR_BUCKETS - 1); // 13

export function designRow(ctx: ConfoundContext): Float64Array {
  const row = new Float64Array(DESIGN_DIM);
  row[0] = 1;
  row[1] = Math.log(Math.max(ctx.followers, 1));
  row[2] = ctx.daysSinceLastPost;
  row[3] = ctx.timeIndex;

  const dow = ctx.publishedAt.getDay();
  if (dow > 0) row[4 + (dow - 1)] = 1;

  const bucket = Math.min(HOUR_BUCKETS - 1, Math.floor(ctx.publishedAt.getHours() / 6));
  if (bucket > 0) row[4 + (DOW_LEVELS - 1) + (bucket - 1)] = 1;

  return row;
}

/**
 * Fit the baseline. Returns null when there is too little data to fit at all —
 * callers must treat that as "no rewards yet", never as "reward 0".
 */
export function fitBaseline(
  rows: BaselineTrainingRow[],
  opts: FitOptions = {},
): BaselineModel | null {
  const halfLifeDays = opts.halfLifeDays ?? 90;
  const lambda = opts.lambda ?? 1;
  if (rows.length < DESIGN_DIM) return null;

  const now =
    opts.now ?? new Date(Math.max(...rows.map((r) => r.publishedAt.getTime())));
  const d = DESIGN_DIM;

  // Normal equations with recency weights: (XᵀWX + lambda I) b = XᵀW y.
  const A: Mat = new Float64Array(d * d);
  const b: Vec = new Float64Array(d);
  const X: Float64Array[] = [];
  const w: number[] = [];
  const y: number[] = [];

  for (const r of rows) {
    const ageDays = (now.getTime() - r.publishedAt.getTime()) / 86_400_000;
    const weight = Math.pow(0.5, Math.max(ageDays, 0) / halfLifeDays);
    const xi = designRow(r);
    const yi = Math.log(Math.max(r.views, 1));
    X.push(xi);
    w.push(weight);
    y.push(yi);
    for (let i = 0; i < d; i++) {
      const wxi = weight * xi[i]!;
      b[i] = b[i]! + wxi * yi;
      for (let j = 0; j < d; j++) A[i * d + j] = A[i * d + j]! + wxi * xi[j]!;
    }
  }

  // Regularise every slope but leave the intercept unpenalised, so shrinkage
  // never drags the overall level of the prediction toward zero.
  for (let i = 1; i < d; i++) A[i * d + i] = A[i * d + i]! + lambda;

  const coefs = solveSPD(A, b, d);
  if (!coefs) return null;

  // Weighted residual standard deviation, with the usual dof correction.
  let ss = 0;
  let wsum = 0;
  for (let k = 0; k < X.length; k++) {
    let pred = 0;
    for (let i = 0; i < d; i++) pred += coefs[i]! * X[k]![i]!;
    const e = y[k]! - pred;
    ss += w[k]! * e * e;
    wsum += w[k]!;
  }
  const dof = Math.max(wsum - d, 1);
  const sigmaResid = Math.sqrt(ss / dof);

  return {
    coefs,
    // A degenerate sigma would make every reward infinite. Floor it.
    sigmaResid: Number.isFinite(sigmaResid) && sigmaResid > 1e-6 ? sigmaResid : 1e-6,
    nTrain: rows.length,
    fittedAt: now.toISOString(),
    designDim: d,
  };
}

/** Expected log(views) for a post, given only non-creative context. */
export function predictLogViews(model: BaselineModel, ctx: ConfoundContext): number {
  const x = designRow(ctx);
  let s = 0;
  for (let i = 0; i < model.designDim; i++) s += model.coefs[i]! * x[i]!;
  return s;
}
