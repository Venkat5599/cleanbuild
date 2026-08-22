import { Empty, PageHead } from '@/components/page-head';
import { getGateEvents } from '@/lib/ratchet';
import type { ReactNode } from 'react';

export const metadata = { title: 'Canon gate' };

const RULE_LABEL: Record<string, string> = {
  contradiction: 'Contradicts something already said',
  hook_cooldown: 'Hook used too recently',
  dead_format: 'Format the evidence has ruled out',
};

export default async function GatePage(): Promise<ReactNode> {
  const rows = await getGateEvents(50);

  return (
    <main>
      <PageHead
        title="Canon gate"
        lede="Before a brief is surfaced it is checked against everything this creator has already said publicly, which hooks are still cooling down, and which formats the model has ruled out."
      />

      {rows.length === 0 ? (
        <Empty
          title="Nothing has been blocked."
          body="An empty log is the expected state. The gate only writes an entry when a draft actually conflicts with the record."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-left">
                <th className="py-2 pr-4 font-medium whitespace-nowrap">When</th>
                <th className="py-2 pr-4 font-medium">Rule</th>
                <th className="py-2 pr-4 font-medium">Verdict</th>
                <th className="py-2 pr-0 font-medium">Explanation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-muted hover:bg-muted/50 border-b">
                  <td className="text-muted-foreground py-2 pr-4 font-mono text-xs tabular-nums">
                    {new Date(r.createdAt).toISOString().slice(0, 10)}
                  </td>
                  <td className="text-foreground py-2 pr-4">{RULE_LABEL[r.rule] ?? r.rule}</td>
                  <td
                    className="py-2 pr-4"
                    style={{ color: r.verdict === 'block' ? 'var(--negative)' : undefined }}
                  >
                    {r.verdict === 'block' ? 'Blocked' : 'Passed'}
                    {r.overridden && <span className="text-muted-foreground"> · overridden</span>}
                  </td>
                  <td className="text-muted-foreground py-2 pr-0">{r.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-border text-muted-foreground mt-8 max-w-[64ch] border-t pt-4 text-sm">
        A block can always be overridden. The override is recorded, because a creator disagreeing
        with the gate is itself information.
      </p>
    </main>
  );
}
