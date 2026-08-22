import { getLearned, level } from '@/lib/ratchet';
import { Empty, PageHead } from '@/components/page-head';
import type { ReactNode } from 'react';

export const metadata = { title: 'What changed' };

export default async function LearnedPage(): Promise<ReactNode> {
  const rows = await getLearned(30);

  if (rows.length === 0) {
    return (
      <Empty
        title="Nothing learned yet."
        body="Each entry is written when an experiment closes. The first appears seven days after the first post."
      />
    );
  }

  return (
    <main>
      <PageHead
        title="What changed, and why"
        lede="Every belief change is recorded with the experiment that caused it. This is the audit trail: nothing moves without a result behind it."
      />

      <ol className="list-none p-0">
        {rows.map((row) => (
          <li key={row.id} className="border-border border-t py-5">
            <p className="text-muted-foreground font-mono text-xs">
              {new Date(row.createdAt).toISOString().replace('T', ' ').slice(0, 16)}
              {row.experimentId !== null && <span> · experiment {row.experimentId}</span>}
            </p>
            <p className="text-foreground mt-2 max-w-[64ch]">{row.summary}</p>
            {row.deltas.length > 0 && (
              <ul className="mt-3 list-none p-0 text-xs">
                {row.deltas.slice(0, 5).map((d) => (
                  <li
                    key={d.name}
                    className="text-muted-foreground grid grid-cols-[1fr_auto] gap-3 py-0.5 sm:grid-cols-[14rem_5rem_1fr]"
                  >
                    <span className="font-mono">{level(d.name)}</span>
                    <span
                      className="font-mono tabular-nums"
                      style={{ color: d.delta >= 0 ? 'var(--accent)' : 'var(--negative)' }}
                    >
                      {d.delta >= 0 ? '+' : ''}
                      {d.delta.toFixed(3)}
                    </span>
                    <span className="font-mono max-sm:hidden">
                      uncertainty {d.sdAfter <= d.sdBefore ? 'down' : 'up'} to ±
                      {(1.96 * d.sdAfter).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}
