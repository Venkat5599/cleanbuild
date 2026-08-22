/**
 * Server-side data access for the dashboard.
 *
 * Talks to the RATCHET Worker over its oRPC endpoint. These run in React
 * Server Components, so the API URL never reaches the browser and no client
 * bundle carries the transport.
 */

const API = process.env.RATCHET_API_URL ?? 'http://127.0.0.1:8787';

/** The demo runs a single creator. Multi-tenant selection is post-jam work. */
export const CREATOR_ID = 1;

async function rpc<T>(procedure: string, input: unknown): Promise<T> {
  const res = await fetch(`${API}/rpc/${procedure}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: input }),
    // Beliefs change when the cron runs, not when someone refreshes. A short
    // revalidation keeps the page current without hammering the Worker.
    next: { revalidate: 30 },
  });
  if (!res.ok) {
    throw new Error(`RATCHET API ${procedure} failed with ${res.status}`);
  }
  const body = (await res.json()) as { json: T };
  return body.json;
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

/** Strips the dimension prefix: "hook_type:question" becomes "question". */
export function level(featureName: string): string {
  return featureName.split(':')[1] ?? featureName;
}
