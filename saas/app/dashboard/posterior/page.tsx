import { IntervalField, type IntervalDatum } from '@/components/interval-field';
import { PageHead } from '@/components/page-head';
import { getPosterior, getSnapshotWeeks, getTimeTravel, liveOrSnapshot } from '@/lib/ratchet';
import { SourceBadge } from '@/components/source-badge';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Posterior' };

export default async function PosteriorPage(): Promise<ReactNode> {
  const p = await liveOrSnapshot(getPosterior, 'posterior');
  const wk = await liveOrSnapshot(getSnapshotWeeks, 'snapshotWeeks');
  const posterior = p.data;
  const weeks = wk.data;
  const source = p.source;

  // Two genuinely different snapshots are required. With one week of history
  // the current posterior is shown alone rather than compared with itself,
  // which would imply a change that did not happen.
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const travel =
    first !== undefined && last !== undefined && first !== last
      ? (await liveOrSnapshot(() => getTimeTravel(first, last), 'timeTravel')).data
      : null;

  // Ranked by effect size, not confidence: a large uncertain effect is exactly
  // what is worth testing next, and ranking by confidence would bury it.
  const ranked = [...posterior.marginals].sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean));
  const ghosts = new Map(travel?.features.map((f) => [f.name, f]) ?? []);

  const data: IntervalDatum[] = ranked.map((m) => {
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
      <PageHead
        title="What works for this audience"
        lede="Every bar is a 95% credible interval, not an estimate. The width is the honest part: it is how much is still unknown."
        meta={
          <>
            <SourceBadge source={source} />{' · '}
            <span className="text-foreground tabular-nums">{posterior.nObs}</span> closed
            experiments
          </>
        }
      />

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
          <p className="text-muted-foreground mt-2 max-w-[46ch] text-sm">
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
            <p className="text-muted-foreground mt-2 max-w-[46ch] text-sm">
              The grey bars are what this agent believed at week {travel.fromWeek}. Nothing was
              retrained; the evidence simply accumulated.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
