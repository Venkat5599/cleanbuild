/**
 * Export the verified local pipeline state as the dashboard's labelled
 * snapshot (saas/lib/snapshot.json).
 *
 * The dashboard reads the live Worker first and falls back to this capture
 * when the Worker is unreachable, labelling it with capturedAt on every page.
 * Shapes mirror the oRPC router outputs exactly, so snapshot mode and live
 * mode render identically.
 *
 * Usage (order matters):
 *   bun run scripts/migrate.ts
 *   bun run scripts/seed-history.ts
 *   bun run scripts/verify-recovery.ts
 *   bun run scripts/generate-briefs.ts
 *   bun run scripts/export-snapshot.ts
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { marginals, featureIndex, FEATURE_NAMES } from '../packages/core/src/index.js';
import { fromFile } from '../packages/db/src/local.js';
import {
  closedExperiments,
  getCreator,
  getNichePrior,
  getPosterior,
  getSnapshot,
  listBriefs,
  listCreators,
  listGateEvents,
  listNotifications,
  listSnapshotWeeks,
  recentBeliefDiffs,
} from '../packages/db/src/queries.js';

const db = fromFile('.data/dev.db');
const creators = await listCreators(db);
if (creators.length === 0) {
  console.error('no creators. run verify-recovery first');
  process.exit(1);
}
const creatorId = creators[0]!.id;

const p = await getPosterior(db, creatorId);
if (!p) {
  console.error('no posterior. run verify-recovery first');
  process.exit(1);
}

const creator = await getCreator(db, creatorId);
const niche = creator ? await getNichePrior(db, creator.niche) : null;
const tau2 = niche?.prior.tau2 ?? 0.25;

const posterior = {
  nObs: p.nObs,
  dim: p.d,
  shrinkageOwn: p.nObs / (p.nObs + 1 / tau2),
  nichePooled: niche?.pooled ?? false,
  marginals: marginals(p),
};

const weeks = await listSnapshotWeeks(db, creatorId);
const first = weeks[0];
const last = weeks[weeks.length - 1];
let timeTravel: unknown = null;
if (first !== undefined && last !== undefined && first !== last) {
  const [from, to] = await Promise.all([
    getSnapshot(db, creatorId, first),
    getSnapshot(db, creatorId, last),
  ]);
  if (from && to) {
    const fromM = marginals(from);
    const toM = marginals(to);
    timeTravel = {
      fromWeek: first,
      toWeek: last,
      fromNObs: from.nObs,
      toNObs: to.nObs,
      features: fromM.map((f, i) => ({
        name: f.name,
        fromMean: f.mean,
        fromSd: f.sd,
        toMean: toM[i]!.mean,
        toSd: toM[i]!.sd,
        uncertaintyDrop: f.sd - toM[i]!.sd,
      })),
    };
  }
}

function activeFeatureNames(x: Float64Array): string[] {
  const out: string[] = [];
  for (let i = 0; i < x.length; i++) if (x[i] !== 0) out.push(FEATURE_NAMES[i]!);
  return out;
}

const closed = await closedExperiments(db, creatorId);
const ledger = closed
  .slice(-100)
  .reverse()
  .map((r) => ({
    experimentId: r.experimentId,
    postId: r.postId,
    title: r.title,
    publishedAt: r.publishedAt,
    reward: r.reward,
    features: activeFeatureNames(r.vector),
  }));

const learned = (await recentBeliefDiffs(db, creatorId, 30)).map((r) => ({
  id: r.id,
  experimentId: r.experimentId,
  createdAt: r.createdAt,
  summary: r.summary,
  deltas: r.deltas,
}));

const notifications = (await listNotifications(db, creatorId, 30)).map((r) => ({
  id: r.id,
  createdAt: r.createdAt,
  sentAt: r.sentAt,
  channel: r.channel,
  body: r.body,
  trigger: r.trigger,
}));

const briefs = (await listBriefs(db, creatorId, 20)).map((r) => ({
  id: r.id,
  createdAt: r.createdAt,
  headline: r.headline,
  features: r.features,
  predictedLift: r.predictedLift,
  ciLow: r.ciLow,
  ciHigh: r.ciHigh,
  rationale: r.rationale,
  isExploratory: r.isExploratory,
  status: r.status,
}));

const gateEvents = (await listGateEvents(db, 50)).map((r) => ({
  id: r.id,
  briefId: r.briefId,
  createdAt: r.createdAt,
  rule: r.rule,
  verdict: r.verdict,
  explanation: r.explanation,
  overridden: r.overridden,
}));

const snapshot = {
  posterior,
  snapshotWeeks: weeks,
  timeTravel,
  ledger,
  learned,
  notifications,
  briefs,
  gateEvents,
  capturedAt: new Date().toISOString(),
};

await mkdir('saas/lib', { recursive: true });
await writeFile('saas/lib/snapshot.json', JSON.stringify(snapshot, null, 1) + '\n');

console.log(
  `snapshot written: ${Object.keys(snapshot).join(', ')} ` +
    `(nObs ${p.nObs}, ${weeks.length} weeks, ${ledger.length} ledger rows, ` +
    `${briefs.length} briefs, ${gateEvents.length} gate events, captured ${snapshot.capturedAt})`,
);