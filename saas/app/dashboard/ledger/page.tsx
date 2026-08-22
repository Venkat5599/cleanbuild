import { getLedger, level } from '@/lib/ratchet';
import type { ReactNode } from 'react';

export const metadata = { title: 'Experiment ledger' };

export default async function LedgerPage(): Promise<ReactNode> {
  const rows = await getLedger(100);

  if (rows.length === 0) {
    return (
      <div className="border-border text-muted-foreground border-l-2 py-3 pl-4">
        <p className="text-foreground font-medium">No closed experiments yet.</p>
        <p className="mt-1 max-w-[52ch] text-sm">
          A post enters the ledger seven days after it is published, once its result has settled.
        </p>
      </div>
    );
  }

  return (
    <main>
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-foreground text-2xl font-medium tracking-tight md:text-3xl">
            Experiment ledger
          </h1>
          <p className="text-muted-foreground mt-2 max-w-[58ch]">
            Every published post, the creative choices it made, and how far it landed from its own
            predicted baseline.
          </p>
        </div>
        <p className="text-muted-foreground font-mono text-xs">
          <span className="text-foreground tabular-nums">{rows.length}</span> shown
        </p>
      </header>

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
              <tr key={r.experimentId} className="border-muted hover:bg-muted/50 border-b">
                <td className="text-muted-foreground py-2 pr-4 font-mono text-xs whitespace-nowrap tabular-nums">
                  {new Date(r.publishedAt).toISOString().slice(0, 10)}
                </td>
                <td className="text-foreground py-2 pr-4">{r.title}</td>
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
