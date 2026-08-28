import Link from 'next/link';
import { PageHead } from '@/components/page-head';
import { getOverview, level } from '@/lib/ratchet';
import { SourceBadge } from '@/components/source-badge';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Overview' };

function fmtT(ts: number | null): string {
  if (!ts) return 'never';
  return new Date(ts).toLocaleString();
}

function chip(c: boolean): string {
  return c ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground';
}

/**
 * The operational console. The page must answer: who is the creator, what
 * does the Mind believe, what is running, what changed, what should happen
 * next — and every number is a live read from the ledger.
 */
export default async function OverviewPage(): Promise<ReactNode> {
  let v: Awaited<ReturnType<typeof getOverview>> | null = null;
  let live = false;
  try {
    v = await getOverview();
    live = true;
  } catch {
    // Overview has no snapshot equivalent — it must be honest about being offline.
  }
  if (!v) {
    return (
      <main className="flex flex-col gap-6">
        <PageHead
          meta={<SourceBadge source={{ live: false }} />}
          title="Overview"
          lede="Where the model stands, and what it did without being asked."
        />
        <p className="border-border text-muted-foreground max-w-[60ch] rounded-2xl border p-6 text-sm leading-relaxed">
          The API did not answer, and this page holds no captured copy — an overview that showed
          made-up numbers would be worse than none. The ledger, posterior and briefs pages show a
          labelled snapshot in this situation; refresh once the API is back.
        </p>
      </main>
    );
  }

  const ownPct = Math.round((v.learning.shrinkageOwn ?? NaN) * 100);
  const strongest = v.learning.strongestPositive
    ? `${level(v.learning.strongestPositive.name)} ${v.learning.strongestPositive.mean >= 0 ? '+' : ''}${v.learning.strongestPositive.mean.toFixed(2)}σ`
    : '—';
  const avgU = v.learning.avgUncertainty ? `±${v.learning.avgUncertainty.toFixed(2)}` : '—';
  const buddy = v.nextAction;

  const stats = [
    {
      label: 'Closed experiments',
      value: v.learning.closedCount,
      hint: 'each one taught the model once',
      href: '/dashboard/ledger',
    },
    {
      label: 'Strongest belief',
      value: strongest,
      hint: 'the feature the model bets on',
      href: '/dashboard/posterior',
    },
    {
      label: 'Uncertainty',
      value: avgU,
      hint: 'mean 95%-interval half-width',
      href: '/dashboard/posterior',
    },
    {
      label: 'Own data',
      value: Number.isNaN(ownPct) ? '—' : `${ownPct}%`,
      hint: `${Number.isNaN(ownPct) ? '' : `${100 - ownPct}%`} still the niche prior`,
      href: '/dashboard/posterior',
    },
  ];

  return (
    <main className="flex flex-col gap-10">
      <PageHead
        meta={<SourceBadge source={{ live }} />}
        title="Overview"
        lede="Where the model stands, and what it did without being asked."
      />

      {/* ------------------------------------------------------------------ */}
      {/* Creator + mind status */}
      {/* ------------------------------------------------------------------ */}
      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="bg-card-secondary rounded-4xl p-6">
          <p className="text-card-foreground-muted font-mono text-xs">CREATOR</p>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <span className="text-foreground text-xl font-medium">{v.creator.handle}</span>
            <span className="text-card-foreground-muted text-sm">{v.creator.niche}</span>
            <span className="text-card-foreground-muted text-sm">
              {v.creator.cadence.toFixed(1)} posts/week
            </span>
            <span className="text-card-foreground-muted text-sm">
              {v.creator.followers.toLocaleString()} followers
            </span>
          </div>
          <div className="text-card-foreground-muted mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            <span>
              Exploration budget{' '}
              <span className="text-foreground font-medium tabular-nums">
                {(v.creator.explorationBudget * 100).toFixed(0)}%
              </span>
            </span>
            <span>
              Last memory update{' '}
              <span className="text-foreground font-medium">
                {v.mind.posteriorUpdatedAt ? fmtT(v.mind.posteriorUpdatedAt) : 'never'}
              </span>
            </span>
            <span>
              Last experiment matured{' '}
              <span className="text-foreground font-medium">{v.mind.lastMaturationAt ? fmtT(v.mind.lastMaturationAt) : 'never'}</span>
            </span>
          </div>
        </div>

        <div className="rounded-4xl border border-border bg-background p-6">
          <p className="text-muted-foreground font-mono text-xs">MIND</p>
          <div className="mt-3 flex items-center gap-3">
            <span
              className={`h-2.5 w-2.5 rounded-full ${live ? 'bg-[var(--accent)]' : 'bg-amber-500'}`}
              aria-hidden="true"
            />
            <span className="text-foreground text-sm font-medium">
              {live ? 'online — cron runs hourly' : 'dashboard reads a captured snapshot'}
            </span>
          </div>
          <ul className="text-muted-foreground mt-3 flex list-none flex-col gap-1.5 p-0 text-xs">
            <li>
              Posterior v<span className="text-foreground tabular-nums">{v.mind.posteriorVersion ?? '—'}</span> ·{' '}
              {v.learning.nObs} observations folded in
            </li>
            <li>
              Last autonomous gate evaluation{' '}
              <span className="text-foreground">{v.mind.lastGateAt ? fmtT(v.mind.lastGateAt) : 'never'}</span>
            </li>
            <li>
              Last follow-up{' '}
              <span className="text-foreground">{v.mind.lastNotificationAt ? fmtT(v.mind.lastNotificationAt) : 'none yet'}</span>
            </li>
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Learning stats — every card links to its evidence */}
      {/* ------------------------------------------------------------------ */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Link
            key={s.label}
            href={s.href}
            className={`rounded-4xl p-6 transition-opacity hover:opacity-90 ${
              i === 0 ? 'bg-card-primary text-[#131210]' : 'bg-card-secondary text-card-foreground'
            }`}
          >
            <p className={`font-mono text-xs ${i === 0 ? 'text-[#131210]/70' : 'text-card-foreground-muted'}`}>
              {s.label}
            </p>
            <p className="mt-3 font-mono text-4xl tabular-nums">{s.value}</p>
            <p className={`mt-2 text-xs ${i === 0 ? 'text-[#131210]/70' : 'text-card-foreground-muted'}`}>
              {s.hint}
            </p>
          </Link>
        ))}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Next action + active experiments */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-10 lg:grid-cols-2">
        <section className="bg-muted rounded-4xl p-7">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-foreground font-medium">Next action</h2>
            <Link href="/dashboard/briefs" className="text-muted-foreground hover:text-foreground text-xs">
              All briefs
            </Link>
          </div>
          {!buddy ? (
            <p className="text-muted-foreground text-sm">
              No brief yet — the act step has not run on this ledger.
            </p>
          ) : (
            <div>
              <p className="text-foreground text-sm font-medium">{buddy.headline}</p>
              <p className="text-card-foreground-muted mt-2 font-mono text-sm tabular-nums">
                predicted {buddy.predictedLift >= 0 ? '+' : ''}
                {buddy.predictedLift.toFixed(2)}σ
                <span className="text-muted-foreground"> [{buddy.ciLow.toFixed(2)}, {buddy.ciHigh.toFixed(2)}]</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-mono ${chip(buddy.isExploratory)}`}>
                  {buddy.isExploratory ? 'explore' : 'exploit'}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-mono ${chip(buddy.status === 'proposed')}`}>
                  {buddy.status}
                </span>
                <span className="bg-background text-muted-foreground rounded-full px-2.5 py-1 text-[11px] font-mono">
                  {buddy.isExploratory
                    ? 'within the exploration budget'
                    : 'sampled highest under the posterior draw'}
                </span>
              </div>
              <p className="text-muted-foreground mt-3 text-xs leading-relaxed">{buddy.rationale}</p>
            </div>
          )}
        </section>

        <section className="bg-muted rounded-4xl p-7">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-foreground font-medium">Active experiments</h2>
            <Link href="/dashboard/ledger" className="text-muted-foreground hover:text-foreground text-xs">
              Full ledger
            </Link>
          </div>
          {v.active.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing open right now. Seven days after a post goes live, its experiment closes and
              teaches the posterior.
            </p>
          ) : (
            <ul className="list-none p-0">
              {v.active.map((e) => (
                <li key={e.id} className="border-border flex items-baseline justify-between gap-4 border-t py-3">
                  <Link
                    href={`/dashboard/experiments/${e.id}`}
                    className="text-foreground hover:underline text-sm"
                  >
                    {e.title}
                  </Link>
                  <span className="text-muted-foreground shrink-0 font-mono text-xs">
                    {e.status} · checkpoint{' '}
                    {e.nextCheckpointAt
                      ? `${Math.max(0, Math.round((e.nextCheckpointAt - e.openedAt) / 3_600_000))}h`
                      : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Recent belief changes */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-muted rounded-4xl p-7">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-foreground font-medium">Recent belief changes</h2>
          <Link href="/dashboard/learned" className="text-muted-foreground hover:text-foreground text-xs">
            All changes
          </Link>
        </div>
        {v.recentChanges.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing yet.</p>
        ) : (
          <ul className="list-none p-0">
            {v.recentChanges.map((row) => (
              <li key={row.id} className="border-border border-t py-3">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-foreground text-sm">{row.summary}</p>
                  {row.experimentId ? (
                    <Link
                      href={`/dashboard/experiments/${row.experimentId}`}
                      className="text-muted-foreground hover:text-foreground shrink-0 font-mono text-xs"
                    >
                      #{row.experimentId}
                    </Link>
                  ) : null}
                </div>
                <p className="text-muted-foreground mt-1 font-mono text-xs">
                  {new Date(row.createdAt).toLocaleString()} ·{" "}
                  {(row.deltas as Array<{ name: string; after: number }>)
                    .slice(0, 3)
                    .map((d) => `${level(d.name)} ${d.after >= 0 ? '+' : ''}${d.after.toFixed(3)}`)
                    .join('  ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}