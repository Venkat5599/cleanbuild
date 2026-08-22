import { IntervalField, type IntervalDatum } from '@/components/interval-field';
import { getPosterior, getSnapshotWeeks, getTimeTravel } from '@/lib/ratchet';
import type { ReactNode } from 'react';

export const metadata = { title: 'Posterior' };

export default async function PosteriorPage(): Promise<ReactNode> {
  const posterior = await getPosterior();
  const weeks = await getSnapshotWeeks();

  // The comparison needs two genuinely different snapshots. With only one week
  // of history the current posterior is shown alone rather than compared
  // against itself, which would imply a change that did not happen.
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const travel =
    first !== undefined && last !== undefined && first !== last
      ? await getTimeTravel(first, last)
      : null;

  // Ranked by effect size, not by confidence: a large uncertain effect is
  // exactly the thing worth testing next, and ranking by confidence would bury
  // it under things already known.
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
  const narrowed = travel?.features.filter((f) => f.uncertaintyDrop > 0).length ?? 0;

  return (
    <main>
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-foreground text-2xl font-medium tracking-tight md:text-3xl">
            What works for this audience
          </h1>
          <p className="text-muted-foreground mt-2 max-w-[58ch]">
            Every bar is a 95% credible interval, not an estimate. The width is the honest part: it
            is how much is still unknown.
          </p>
        </div>
        <p className="text-muted-foreground font-mono text-xs">
          <span className="text-foreground tabular-nums">{posterior.nObs}</span> closed experiments
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

      <section className="border-border mt-10 grid gap-8 border-t pt-6 sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground font-mono text-xs">Belief mix</p>
          <p className="mt-2">
            <span className="text-foreground font-mono tabular-nums">{ownPct}%</span> this
            creator&rsquo;s own data,{' '}
            <span className="text-foreground font-mono tabular-nums">{100 - ownPct}%</span> niche
            prior.
          </p>
          <p className="text-muted-foreground mt-2 max-w-[44ch] text-sm">
            {posterior.nichePooled
              ? 'The niche prior is pooled from other creators in the same niche.'
              : 'Too few creators in this niche to pool, so a fixed prior is used. Pooling starts at three.'}
          </p>
        </div>

        {travel && (
          <div>
            <p className="text-muted-foreground font-mono text-xs">Memory</p>
            <p className="mt-2">
              <span className="text-foreground font-mono tabular-nums">{narrowed}</span> of{' '}
              <span className="text-foreground font-mono tabular-nums">
                {travel.features.length}
              </span>{' '}
              features grew more certain between week {travel.fromWeek} and week {travel.toWeek}.
            </p>
            <p className="text-muted-foreground mt-2 max-w-[44ch] text-sm">
              The grey bars above are what this agent believed at week {travel.fromWeek}. Nothing
              was retrained; the evidence simply accumulated.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
