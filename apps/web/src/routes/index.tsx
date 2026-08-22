import { createFileRoute } from '@tanstack/react-router';
import { IntervalField, type IntervalDatum } from '../components/IntervalField';
import { DEMO_CREATOR_ID, api } from '../lib/api';

export const Route = createFileRoute('/')({
  loader: async () => {
    const posterior = await api.posterior({ creatorId: DEMO_CREATOR_ID });
    const weeks = await api.snapshotWeeks({ creatorId: DEMO_CREATOR_ID });

    // The time-travel comparison needs two real snapshots. If only one week
    // exists the page renders the current posterior alone rather than faking a
    // comparison against itself.
    const first = weeks[0];
    const last = weeks[weeks.length - 1];
    const travel =
      first !== undefined && last !== undefined && first !== last
        ? await api.timeTravel({ creatorId: DEMO_CREATOR_ID, fromWeek: first, toWeek: last })
        : null;

    return { posterior, travel };
  },
  component: Posterior,
  pendingComponent: () => (
    <div className="state">
      <strong>Reading the posterior.</strong>
    </div>
  ),
});

function Posterior() {
  const { posterior, travel } = Route.useLoaderData();

  // Sorted by effect size so the strongest findings sit at the top. Ranking by
  // confidence instead would bury a large uncertain effect that is exactly what
  // the creator should test next.
  const ranked = [...posterior.marginals].sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean));

  const ghosts = new Map(travel?.features.map((f) => [f.name, f]) ?? []);
  const data: IntervalDatum[] = ranked.slice(0, 18).map((m) => {
    const g = ghosts.get(m.name);
    const datum: IntervalDatum = {
      name: m.name,
      mean: m.mean,
      ciLow: m.ciLow,
      ciHigh: m.ciHigh,
      probPositive: m.probPositive,
    };
    if (g) {
      datum.ghost = {
        mean: g.fromMean,
        ciLow: g.fromMean - 1.96 * g.fromSd,
        ciHigh: g.fromMean + 1.96 * g.fromSd,
      };
    }
    return datum;
  });

  const ownPct = Math.round(posterior.shrinkageOwn * 100);
  const narrowed = travel
    ? travel.features.filter((f) => f.uncertaintyDrop > 0).length
    : 0;

  return (
    <main>
      <header className="section-head">
        <div>
          <h1>What works for this audience</h1>
          <p className="lede">
            Every bar is a 95% credible interval, not an estimate. The width is the honest part:
            it is how much is still unknown.
          </p>
        </div>
        <p className="meta">
          <span className="num">{posterior.nObs}</span> closed experiments
        </p>
      </header>

      <IntervalField
        data={data}
        domain={1}
        {...(travel
          ? {
              ghostLabel: `week ${travel.fromWeek}, ${travel.fromNObs} experiments`,
              liveLabel: `week ${travel.toWeek}, ${travel.toNObs} experiments`,
            }
          : {})}
      />

      <section className="readout">
        <div className="readout__item">
          <p className="meta">Belief mix</p>
          <p>
            <span className="num">{ownPct}%</span> this creator's own data,{' '}
            <span className="num">{100 - ownPct}%</span> niche prior.
          </p>
          <p className="faint">
            {posterior.nichePooled
              ? 'The niche prior is pooled from other creators in the same niche.'
              : 'Too few creators in this niche to pool, so a fixed prior is used. Pooling starts at three.'}
          </p>
        </div>

        {travel && (
          <div className="readout__item">
            <p className="meta">Memory</p>
            <p>
              <span className="num">{narrowed}</span> of{' '}
              <span className="num">{travel.features.length}</span> features grew more certain
              between week {travel.fromWeek} and week {travel.toWeek}.
            </p>
            <p className="faint">
              The grey bars behind are what this agent believed at week {travel.fromWeek}. Nothing
              was retrained; the evidence simply accumulated.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
