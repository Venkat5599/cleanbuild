import { Empty, PageHead } from '@/components/page-head';
import { GateRunner, OverrideButton } from '@/components/gate-runner';
import { getGateEvents, liveOrSnapshot } from '@/lib/ratchet';
import { SourceBadge } from '@/components/source-badge';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Canon gate' };

const RULE_LABEL: Record<string, string> = {
  contradiction: 'Contradicts something already said',
  hook_cooldown: 'Hook used too recently',
  dead_format: 'Format the evidence has ruled out',
  embedding: 'Embedding similarity to a recorded stance',
};

export default async function GatePage(): Promise<ReactNode> {
  const r = await liveOrSnapshot(() => getGateEvents(50), 'gateEvents');
  const rows = r.data;
  const source = r.source;

  return (
    <main>
      <PageHead
        meta={<SourceBadge source={source} />}
        title="Canon gate"
        lede="Before a brief is surfaced it is checked against everything this creator has already said publicly, which hooks are still cooling down, and which formats the model has ruled out."
      />

      <GateRunner />

      {rows.length === 0 ? (
        <Empty
          title="The log is empty."
          body="The gate only writes an entry when a draft is actually evaluated. Run the gate above, or generate briefs — every candidate is gated and recorded."
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
                  <td className="text-muted-foreground py-2 pr-4 text-sm">
                    {r.verdict === 'block' ? (
                      <span style={{ color: 'var(--negative)' }}>Blocked</span>
                    ) : (
                      'Passed'
                    )}
                    {r.overridden && <span className="text-muted-foreground"> · overridden</span>}
                    {r.verdict === 'block' && (
                      <span className="ml-2">
                        <OverrideButton eventId={r.id} overridden={r.overridden} />
                      </span>
                    )}
                  </td>
                  <td className="text-muted-foreground py-2 pr-0">{r.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-border text-muted-foreground mt-8 max-w-[64ch] border-t pt-4 text-sm">
        A block can be overridden. The override is recorded on the event and shown here, because a
        creator disagreeing with the gate is itself information the audit trail must keep.
      </p>
    </main>
  );
}
