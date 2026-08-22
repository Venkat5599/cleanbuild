import { Empty, PageHead } from '@/components/page-head';
import { getBriefs, orUnavailable } from '@/lib/ratchet';
import { NotConnected } from '../not-connected';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Briefs' };

/**
 * Briefs.
 *
 * What to make next, chosen by sampling from the posterior rather than always
 * taking the current best guess. A capped share are deliberately exploratory,
 * which is the only way a belief that is wrong ever gets found out.
 */
export default async function BriefsPage(): Promise<ReactNode> {
  const briefs = await orUnavailable(() => getBriefs(20), null);
  if (!briefs) return <NotConnected />;
  const exploratory = briefs.filter((b) => b.isExploratory).length;

  return (
    <main>
      <PageHead
        title="What to make next"
        lede="Each brief is drawn from the model rather than from its current favourite, so the schedule keeps testing instead of converging on one answer too early."
        meta={
          briefs.length > 0 ? (
            <>
              <span className="text-foreground tabular-nums">{exploratory}</span> of{' '}
              <span className="text-foreground tabular-nums">{briefs.length}</span> exploratory
            </>
          ) : undefined
        }
      />

      {briefs.length === 0 ? (
        <Empty
          title="No briefs generated yet."
          body="Briefs are produced by the agent from the current posterior and the creator's canon. None have been requested for this creator."
        />
      ) : (
        <ul className="list-none p-0">
          {briefs.map((b) => (
            <li key={b.id} className="border-border border-t py-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-foreground font-medium">{b.headline || `Brief ${b.id}`}</p>
                <p className="text-muted-foreground font-mono text-xs">
                  predicted{' '}
                  <span
                    style={{ color: b.predictedLift >= 0 ? 'var(--accent)' : 'var(--negative)' }}
                  >
                    {b.predictedLift >= 0 ? '+' : ''}
                    {b.predictedLift.toFixed(2)}
                  </span>{' '}
                  <span className="tabular-nums">
                    [{b.ciLow.toFixed(2)}, {b.ciHigh.toFixed(2)}]
                  </span>
                </p>
              </div>
              {b.rationale && (
                <p className="text-muted-foreground mt-2 max-w-[64ch] text-sm">{b.rationale}</p>
              )}
              <p className="text-muted-foreground mt-2 font-mono text-xs">
                {b.isExploratory ? 'exploratory' : 'exploit'} · {b.status}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="border-border text-muted-foreground mt-8 max-w-[64ch] border-t pt-4 text-sm">
        Exploratory briefs are capped. An unconstrained sampler would happily spend a real channel
        on experiments, which is optimal for the model and bad for the creator.
      </p>
    </main>
  );
}
