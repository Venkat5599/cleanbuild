/**
 * Server-side data access for the dashboard.
 *
 * Talks to the RATCHET Worker over its oRPC endpoint. These run in React
 * Server Components, so the API URL never reaches the browser and no client
 * bundle carries the transport.
 */

import snapshot from './snapshot.json';

const API = process.env.RATCHET_API_URL ?? 'http://127.0.0.1:8787';

/**
 * Whether the pages are reading a live Worker or a captured snapshot.
 *
 * The snapshot is a real export of a verified run, not invented numbers, and
 * every page that uses it says so. That distinction matters: a dashboard that
 * silently shows stale data as if it were live is lying, while one that says
 * "this is a snapshot from a specific date" is just honest about deployment.
 */
export const SNAPSHOT_CAPTURED_AT: string = (snapshot as { capturedAt: string }).capturedAt;

export interface Source {
  live: boolean;
  capturedAt?: string;
}

/** The demo runs a single creator. Multi-tenant selection is post-jam work. */
export const CREATOR_ID = 1;

/**
 * Thrown when the Worker cannot be reached at all.
 *
 * Distinguished from a bad response on purpose: a build machine with no Worker
 * running is an expected condition, and the dashboard should render an honest
 * "not connected" state rather than failing the deploy.
 */
export class ApiUnavailableError extends Error {
  constructor(readonly procedure: string, cause: unknown) {
    super(`RATCHET API is unreachable (${procedure}): ${String(cause)}`);
    this.name = 'ApiUnavailableError';
  }
}

async function rpc<T>(procedure: string, input: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}/rpc/${procedure}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: input }),
      // Beliefs change when the cron runs, not when someone refreshes. A short
      // revalidation keeps pages current without hammering the Worker.
      next: { revalidate: 30 },
    });
  } catch (e) {
    throw new ApiUnavailableError(procedure, e);
  }
  if (!res.ok) {
    throw new ApiUnavailableError(procedure, `HTTP ${res.status}`);
  }
  const body = (await res.json()) as { json: T };
  return body.json;
}

/**
 * Run a loader, returning a fallback when the Worker is simply not there.
 *
 * Only ApiUnavailableError is caught. A malformed response or a bug in a page
 * still surfaces, because silently swallowing those would hide real faults
 * behind a permanently empty dashboard.
 */
export async function orUnavailable<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (e) {
    if (e instanceof ApiUnavailableError) return fallback;
    throw e;
  }
}

/**
 * Read live if the Worker answers, otherwise fall back to the captured
 * snapshot. Returns which one it got, so the page can label it.
 */
export async function liveOrSnapshot<T>(
  load: () => Promise<T>,
  key: keyof typeof snapshot,
): Promise<{ data: T; source: Source }> {
  try {
    return { data: await load(), source: { live: true } };
  } catch (e) {
    if (!(e instanceof ApiUnavailableError)) throw e;
    return {
      data: snapshot[key] as T,
      source: { live: false, capturedAt: SNAPSHOT_CAPTURED_AT },
    };
  }
}

export interface Marginal {
  index: number;
  name: string;
  mean: number;
  sd: number;
  ciLow: number;
  ciHigh: number;
  probPositive: number;
}

export interface PosteriorView {
  nObs: number;
  dim: number;
  shrinkageOwn: number;
  nichePooled: boolean;
  marginals: Marginal[];
}

export interface TimeTravelView {
  fromWeek: number;
  toWeek: number;
  fromNObs: number;
  toNObs: number;
  features: Array<{
    name: string;
    fromMean: number;
    fromSd: number;
    toMean: number;
    toSd: number;
    uncertaintyDrop: number;
  }>;
}

export interface LedgerRow {
  experimentId: number;
  postId: number;
  title: string;
  publishedAt: number;
  reward: number;
  features: string[];
}

export interface BeliefDiffRow {
  id: number;
  experimentId: number | null;
  createdAt: number;
  summary: string;
  deltas: Array<{
    name: string;
    before: number;
    after: number;
    delta: number;
    sdBefore: number;
    sdAfter: number;
  }>;
}

export interface NotificationRow {
  id: number;
  createdAt: number;
  sentAt: number | null;
  channel: string;
  body: string;
  trigger: { reason?: string; source?: string };
}

export const getPosterior = () => rpc<PosteriorView>('posterior', { creatorId: CREATOR_ID });

export const getSnapshotWeeks = () => rpc<number[]>('snapshotWeeks', { creatorId: CREATOR_ID });

export const getTimeTravel = (fromWeek: number, toWeek: number) =>
  rpc<TimeTravelView>('timeTravel', { creatorId: CREATOR_ID, fromWeek, toWeek });

export const getLedger = (limit = 100) =>
  rpc<LedgerRow[]>('ledger', { creatorId: CREATOR_ID, limit });

export const getLearned = (limit = 30) =>
  rpc<BeliefDiffRow[]>('learned', { creatorId: CREATOR_ID, limit });

export const getNotifications = (limit = 30) =>
  rpc<NotificationRow[]>('notifications', { creatorId: CREATOR_ID, limit });

export interface BriefRow {
  id: number;
  createdAt: number;
  headline: string;
  features: Record<string, string | number>;
  predictedLift: number;
  ciLow: number;
  ciHigh: number;
  rationale: string;
  isExploratory: boolean;
  status: string;
}

export interface GateEventRow {
  id: number;
  briefId: number;
  createdAt: number;
  rule: 'contradiction' | 'hook_cooldown' | 'dead_format';
  verdict: 'pass' | 'block';
  explanation: string;
  overridden: boolean;
}

export interface CreatorRow {
  id: number;
  handle: string;
  platform: string;
  niche: string;
  followers: number;
  explorationBudget: number;
}

export const getBriefs = (limit = 20) =>
  rpc<BriefRow[]>('briefs', { creatorId: CREATOR_ID, limit });

export const getGateEvents = (limit = 50) => rpc<GateEventRow[]>('gateEvents', { limit });

export const getCreators = () => rpc<CreatorRow[]>('creators', {});

/** Strips the dimension prefix: "hook_type:question" becomes "question". */
export function level(featureName: string): string {
  return featureName.split(':')[1] ?? featureName;
}

/* ------------------------------------------------------------------ */
/* Operational console procedures (added for the interactive build).  */
/* ------------------------------------------------------------------ */

export interface OverviewView {
  creator: {
    handle: string;
    platform: string;
    niche: string;
    followers: number;
    explorationBudget: number;
    cadence: number;
  };
  mind: {
    posteriorVersion: number | null;
    posteriorUpdatedAt: number | null;
    lastMaturationAt: number | null;
    lastGateAt: number | null;
    lastNotificationAt: number | null;
  };
  learning: {
    closedCount: number;
    dim: number;
    nObs: number;
    strongestPositive: Marginal | null;
    strongestNegative: Marginal | null;
    avgUncertainty: number | null;
    shrinkageOwn: number | null;
  };
  active: Array<{
    id: number;
    title: string;
    status: string;
    openedAt: number;
    nextCheckpointAt: number | null;
  }>;
  recentChanges: Array<{
    id: number;
    createdAt: number;
    experimentId: number | null;
    summary: string;
    deltas: BeliefDiffRow['deltas'];
  }>;
  nextAction: {
    id: number;
    headline: string;
    predictedLift: number;
    ciLow: number;
    ciHigh: number;
    isExploratory: boolean;
    status: string;
    createdAt: number;
    rationale: string;
  } | null;
}

export interface ExperimentDetailView {
  experimentId: number;
  postId: number;
  status: string;
  openedAt: number;
  nextCheckpointAt: number | null;
  closedAt: number | null;
  reward: number | null;
  rewardComponents: {
    raw: number;
    clipped: number;
    wasClipped: boolean;
    predictedLogViews: number;
    actualLogViews: number;
    sigmaResid: number;
  } | null;
  title: string;
  publishedAt: number;
  features: Record<string, string | number> | null;
  confounds: {
    followers: number;
    daysSinceLastPost: number;
    timeIndex: number;
    publishedAt: string;
  } | null;
  checkpoints: Array<{
    checkpoint: string;
    views: number | null;
    watchTime: number | null;
    comments: number | null;
    likes: number | null;
    followerDelta: number | null;
    collectedAt: number;
  }>;
  beliefDiffs: Array<{
    id: number;
    createdAt: number;
    deltas: BeliefDiffRow['deltas'];
    summary: string;
  }>;
}

export interface FeatureExplainView {
  feature: string;
  marginal: Marginal | null;
  supporting: Array<{ id: number; experimentId: number | null; createdAt: number; delta: number; summary: string }>;
  against: Array<{ id: number; experimentId: number | null; createdAt: number; delta: number; summary: string }>;
}

export type ActivityEvent = Record<string, unknown> & {
  type: string;
  at: number;
};

export interface MemoryView {
  claims: Array<{ id: number; postId: number | null; text: string; statedAt: number }>;
  bits: Array<{ id: number; name: string; description: string; lastUsedAt: number | null }>;
  briefs: Array<{ id: number; headline: string; status: string; isExploratory: boolean; createdAt: number }>;
  notifications: Array<{ id: number; channel: string; body: string; sentAt: number | null; createdAt: number }>;
  cadence: number;
  learnedTop: Array<{ name: string; mean: number; sd: number; probPositive: number }>;
}

export const getOverview = () => rpc<OverviewView>('overview', { creatorId: CREATOR_ID });

export const getExperimentDetail = (experimentId: number) =>
  rpc<ExperimentDetailView>('experimentDetail', { creatorId: CREATOR_ID, experimentId });

export const getFeatureExplain = (feature: string) =>
  rpc<FeatureExplainView>('featureExplain', { creatorId: CREATOR_ID, feature });

export const getActivity = (limit = 40) => rpc<ActivityEvent[]>('activity', { creatorId: CREATOR_ID, limit });

export const getMemory = () => rpc<MemoryView>('memory', { creatorId: CREATOR_ID });

export const getClaims = () => rpc<Array<{ id: number; postId: number | null; text: string; statedAt: number }>>('claims', { creatorId: CREATOR_ID });
