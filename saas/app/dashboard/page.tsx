import Link from 'next/link';
import { PageHead } from '@/components/page-head';
import { getLearned, getLedger, getNotifications, getPosterior, liveOrSnapshot } from '@/lib/ratchet';
import { SourceBadge } from '@/components/source-badge';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Overview' };

/**
 * Overview.
 *
 * Four numbers and the most recent thing that happened. Deliberately not a
 * wall of charts: the detail lives on its own route, and this page exists to
 * say where the model stands and what it did last.
 */
export default async function OverviewPage(): Promise<ReactNode> {
  const p = await liveOrSnapshot(getPosterior, 'posterior');
  const l = await liveOrSnapshot(() => getLedger(5), 'ledger');
  const w = await liveOrSnapshot(() => getLearned(3), 'learned');
  const n = await liveOrSnapshot(() => getNotifications(3), 'notifications');
  const posterior = p.data;
  const ledger = l.data.slice(0, 5);
  const learned = w.data.slice(0, 3);
  const notifications = n.data.slice(0, 3);
  const source = p.source;

  const confident = posterior.marginals.filter(
    (m) => m.probPositive >= 0.9 || m.probPositive <= 0.1,
  ).length;
  const ownPct = Math.round(posterior.shrinkageOwn * 100);
  const delivered = notifications.filter((n) => n.sentAt !== null).length;

  const stats = [
    { label: 'Closed experiments', value: posterior.nObs, hint: 'each one taught the model once' },
    { label: 'Settled features', value: confident, hint: 'past 90% confidence either way' },
    { label: 'Own data', value: `${ownPct}%`, hint: `${100 - ownPct}% still the niche prior` },
    { label: 'Follow-ups sent', value: delivered, hint: 'with nobody logged in' },
  ];

  return (
    <main>
      <PageHead
        meta={<SourceBadge source={source} />}
        title="Overview"
        lede="Where the model stands, and what it did without being asked."
      />

      {/* Same card language as the landing page's bento, so walking from one
          into the other does not feel like two products. */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            // The primary card's fill is light in both themes, so its text is
            // pinned to ink rather than inheriting the theme foreground. The
            // muted token is grey and was illegible on sage.
            className={`rounded-4xl p-6 ${
              i === 0 ? 'bg-card-primary text-[#131210]' : 'bg-card-secondary text-card-foreground'
            }`}
          >
            <p
              className={`font-mono text-xs ${
                i === 0 ? 'text-[#131210]/70' : 'text-card-foreground-muted'
              }`}
            >
              {s.label}
            </p>
            <p className="mt-3 font-mono text-4xl tabular-nums">{s.value}</p>
            <p
              className={`mt-2 text-xs ${
                i === 0 ? 'text-[#131210]/70' : 'text-card-foreground-muted'
              }`}
            >
              {s.hint}
            </p>
          </div>
        ))}
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section className="bg-muted rounded-4xl p-7">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-foreground font-medium">Most recent belief change</h2>
            <Link href="/dashboard/learned" className="text-muted-foreground hover:text-foreground text-xs">
              All changes
            </Link>
          </div>
          {learned.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing yet.</p>
          ) : (
            <ul className="list-none p-0">
              {learned.map((row) => (
                <li key={row.id} className="border-border border-t py-3">
                  <p className="text-muted-foreground font-mono text-xs">
                    {new Date(row.createdAt).toISOString().slice(0, 10)}
                  </p>
                  <p className="text-foreground mt-1 text-sm">{row.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-muted rounded-4xl p-7">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-foreground font-medium">Latest experiments</h2>
            <Link href="/dashboard/ledger" className="text-muted-foreground hover:text-foreground text-xs">
              Full ledger
            </Link>
          </div>
          <ul className="list-none p-0">
            {ledger.map((r) => (
              <li
                key={r.experimentId}
                className="border-border flex items-baseline justify-between gap-4 border-t py-3"
              >
                <span className="text-foreground min-w-0 truncate text-sm">{r.title}</span>
                <span
                  className="shrink-0 font-mono text-sm tabular-nums"
                  style={{ color: r.reward >= 0 ? 'var(--accent)' : 'var(--negative)' }}
                >
                  {r.reward >= 0 ? '+' : ''}
                  {r.reward.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
