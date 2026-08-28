import Link from 'next/link';
import { getLedger, level, liveOrSnapshot } from '@/lib/ratchet';
import { Empty, PageHead } from '@/components/page-head';
import { SourceBadge } from '@/components/source-badge';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Experiment ledger' };

export default async function LedgerPage(): Promise<ReactNode> {
  const r = await liveOrSnapshot(() => getLedger(100), 'ledger');
  const rows = r.data;
  const source = r.source;

  if (rows.length === 0) {
    return (
      <Empty
        title="No closed experiments yet."
        body="A post enters the ledger seven days after it is published, once its result has settled."
      />
    );
  }

  return (
    <main>
      <PageHead
        title="Experiment ledger"
        lede="Every published post, the creative choices it made, and how far it landed from its own predicted baseline."
        meta={
          <>
            <SourceBadge source={source} />{' · '}
            <span className="text-foreground tabular-nums">{rows.length}</span> shown
          </>
        }
      />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-border text-muted-foreground border-b text-left">
              <th className="py-2 pr-4 font-medium whitespace-nowrap">Published</th>
              <th className="py-2 pr-4 font-medium">Title</th>
              <th className="py-2 pr-4 font-medium">Choices</th>
              <th className="py-2 pr-0 text-right font-medium whitespace-nowrap">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.experimentId} className="border-muted hover:bg-muted/50 border-b relative">
                <td className="text-muted-foreground py-2 pr-4 font-mono text-xs whitespace-nowrap tabular-nums">
                  <Link href={`/dashboard/experiments/${r.experimentId}`}>
                    #{r.experimentId} · {new Date(r.publishedAt).toISOString().slice(0, 10)}
                  </Link>
                </td>
                <td className="text-foreground py-2 pr-4 group-hover:underline">
                  <Link href={`/dashboard/experiments/${r.experimentId}`} className="after:absolute after:inset-0 after:content-['']">
                    {r.title}
                  </Link>
                </td>
                <td className="text-muted-foreground py-2 pr-4 font-mono text-xs">
                  {r.features.map(level).join('  ')}
                </td>
                <td
                  className="py-2 pr-0 text-right font-mono tabular-nums"
                  style={{ color: r.reward >= 0 ? 'var(--accent)' : 'var(--negative)' }}
                >
                  {r.reward >= 0 ? '+' : ''}
                  {r.reward.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-border text-muted-foreground mt-8 max-w-[64ch] border-t pt-4 text-sm">
        Result is measured in standard deviations against what this channel was expected to do given
        its follower count, the day, the hour and the gap since the last post. Raw view counts are
        not used, because they mostly measure how big the channel already was.
      </p>
    </main>
  );
}
