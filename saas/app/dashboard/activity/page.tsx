import Link from 'next/link';
import { PageHead } from '@/components/page-head';
import { getActivity } from '@/lib/ratchet';
import { SourceBadge } from '@/components/source-badge';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Autonomous activity' };

const RULES: Record<string, string> = {
  contradiction: 'Contradiction',
  hook_cooldown: 'Hook cooldown',
  dead_format: 'Dead format',
  embedding: 'Embedding',
};

/**
 * The activity feed is assembled from the same persisted rows the ledger,
 * learned, gate and follow-ups pages read — nothing is manufactured for this
 * page. Each entry names the row type and links to its evidence.
 */
export default async function ActivityPage(): Promise<ReactNode> {
  let events: Awaited<ReturnType<typeof getActivity>> = [];
  let live = false;
  try {
    events = await getActivity();
    live = true;
  } catch {
    // No snapshot equivalent for the activity feed — offline must be honest.
  }

  const typeLabel = (t: string): string =>
    ({ belief_diff: 'belief changed', gate: 'gate evaluation', notification: 'follow-up', experiment_closed: 'experiment matured' })[t] ?? t;

  return (
    <main>
      <PageHead
        meta={<SourceBadge source={{ live }} />}
        title="Autonomous activity"
        lede="What the scheduled job did while nobody was logged in. Every row is a real ledger entry."
      />

      {events.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing on record yet. The feed fills as experiments close, beliefs move, drafts are gated
          and follow-ups are composed.
        </p>
      ) : (
        <ul className="list-none p-0">
          {events.map((e, i) => {
            const key = `${e.type}-${String(e.id ?? i)}`;
            const body =
              e.type === 'belief_diff' ? (
                <>
                  <span className="text-foreground">{e.summary as string}</span>{' '}
                  <span className="text-muted-foreground">— caused by</span>{' '}
                  {e.experimentId ? (
                    <Link href={`/dashboard/experiments/${e.experimentId as number}`} className="text-foreground hover:underline">
                      experiment #{String(e.experimentId)}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">an earlier ledger entry</span>
                  )}
                </>
              ) : e.type === 'gate' ? (
                <>
                  <span className="text-muted-foreground">{RULES[e.rule as string] ?? String(e.rule)}</span>{' '}
                  <span className={e.verdict === 'block' ? 'text-destructive' : 'text-foreground'}>
                    {e.verdict === 'block' ? 'blocked' : 'passed'}
                  </span>{' '}
                  <span className="text-muted-foreground">{e.explanation as string}</span>{' '}
                  <span className="text-muted-foreground">(brief #{String(e.briefId)})</span>
                </>
              ) : e.type === 'notification' ? (
                <>
                  <span className="text-foreground">
                    {e.channel === 'mind' ? 'Mind' : e.channel === 'telegram' ? 'Telegram' : 'Stored'} message
                  </span>{' '}
                  <span className="text-muted-foreground">
                    {e.sentAt ? 'delivered' : 'composed, not delivered'}
                  </span>{' '}
                  <span className="text-muted-foreground">· {(e.body as string).slice(0, 120)}</span>
                </>
              ) : (
                <>
                  <span className="text-foreground">Experiment #{String(e.experimentId)} closed</span>{' '}
                  <span className="text-muted-foreground">(reward {(e.reward as number) >= 0 ? '+' : ''}{(e.reward as number).toFixed(2)}σ)</span>
                </>
              );

            return (
              <li key={key} className="border-border flex items-baseline justify-between gap-4 border-t py-3">
                <div className="min-w-0">
                  <p className="text-sm leading-relaxed">{body}</p>
                </div>
                <p className="text-muted-foreground shrink-0 text-right font-mono text-[10px] leading-5">
                  <span className="block">{new Date(e.at as number).toLocaleString()}</span>
                  <span className="block">{typeLabel(e.type)}</span>
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <p className="border-border text-muted-foreground mt-8 max-w-[64ch] border-t pt-4 text-sm">
        Activity here is the audit trail of the autonomy claim: maturation, gating and follow-up
        decisions are all persisted rows, and every link on this page resolves to that row&apos;s
        evidence.
      </p>
    </main>
  );
}