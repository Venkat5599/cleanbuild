/**
 * Residual reward (PRD 8.2 / FR-4).
 *
 * reward = clip( (log(views) - log(views_hat)) / sigma_resid , -clip, +clip )
 *
 * The clip is not cosmetic. One genuinely viral post can carry a residual of
 * 8+ sigma, and without clipping that single observation dominates the
 * posterior and the agent concludes that whatever arbitrary hook it used is a
 * law of nature. Clipping bounds the influence of any one experiment.
 */

import { predictLogViews, type BaselineModel, type ConfoundContext } from './baseline.js';

export const DEFAULT_REWARD_CLIP = 4;

export interface RewardComponents {
  raw: number;
  clipped: number;
  wasClipped: boolean;
  predictedLogViews: number;
  actualLogViews: number;
  sigmaResid: number;
}

export function residualReward(
  views: number,
  model: BaselineModel,
  ctx: ConfoundContext,
  clip: number = DEFAULT_REWARD_CLIP,
): RewardComponents {
  const predictedLogViews = predictLogViews(model, ctx);
  const actualLogViews = Math.log(Math.max(views, 1));
  const raw = (actualLogViews - predictedLogViews) / model.sigmaResid;
  const clipped = Math.max(-clip, Math.min(clip, raw));
  return {
    raw,
    clipped,
    wasClipped: clipped !== raw,
    predictedLogViews,
    actualLogViews,
    sigmaResid: model.sigmaResid,
  };
}

/**
 * Blend the primary view-residual with secondary signals.
 *
 * v1 uses fixed weights that are surfaced in the UI rather than learned — a
 * learned reward weighting on this little data would be fitting noise.
 * Secondary signals are already expected to arrive as z-scores.
 */
export interface SecondarySignals {
  retentionZ?: number;
  commentRateZ?: number;
  followerDeltaZ?: number;
}

export const REWARD_WEIGHTS = {
  views: 0.6,
  retention: 0.2,
  commentRate: 0.1,
  followerDelta: 0.1,
} as const;

export function blendReward(
  viewsResidual: number,
  secondary: SecondarySignals = {},
  clip: number = DEFAULT_REWARD_CLIP,
): number {
  const w = REWARD_WEIGHTS;
  // Missing signals are dropped and the remaining weights renormalised, so a
  // creator whose platform hides retention is not silently scored as zero.
  let sum = w.views * viewsResidual;
  let wsum = w.views;
  if (secondary.retentionZ !== undefined) {
    sum += w.retention * secondary.retentionZ;
    wsum += w.retention;
  }
  if (secondary.commentRateZ !== undefined) {
    sum += w.commentRate * secondary.commentRateZ;
    wsum += w.commentRate;
  }
  if (secondary.followerDeltaZ !== undefined) {
    sum += w.followerDelta * secondary.followerDeltaZ;
    wsum += w.followerDelta;
  }
  const blended = sum / wsum;
  return Math.max(-clip, Math.min(clip, blended));
}
