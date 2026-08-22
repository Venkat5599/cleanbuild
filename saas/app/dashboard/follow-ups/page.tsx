import { getNotifications } from '@/lib/ratchet';
import type { ReactNode } from 'react';

export const metadata = { title: 'Autonomous follow-ups' };

export default async function FollowUpsPage(): Promise<ReactNode> {
  const rows = await getNotifications(30);

  if (rows.length === 0) {
    return (
      <main>
        <h1 className="text-foreground text-2xl font-medium tracking-tight md:text-3xl">
          Autonomous follow-ups
        </h1>
        <div className="border-border text-muted-foreground mt-6 border-l-2 py-3 pl-4">
          <p className="text-foreground font-medium">No follow-ups yet.</p>
          <p className="mt-1 max-w-[56ch] text-sm">
            Nothing is sent until a belief change is worth interrupting someone for: a feature
            crossing 90% confidence, a settled belief reversing, or one result moving a weight
            unusually far. Ordinary posts move beliefs slightly and stay in the dashboard.
          </p>
        </div>
      </main>
    );
  }

  const delivered = rows.filter((r) => r.sentAt !== null).length;

  return (
    <main>
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-foreground text-2xl font-medium tracking-tight md:text-3xl">
            Autonomous follow-ups
          </h1>
          <p className="text-muted-foreground mt-2 max-w-[58ch]">
            Composed by a scheduled job with nobody logged in. The message goes to the Mind, which
            decides how and when to reach the creator.
          </p>
        </div>
        <p className="text-muted-foreground font-mono text-xs">
          <span className="text-foreground tabular-nums">{delivered}</span> delivered ·{' '}
          <span className="text-foreground tabular-nums">{rows.length - delivered}</span> undelivered
        </p>
      </header>

      <ol className="list-none p-0">
        {rows.map((n) => (
          <li key={n.id} className="border-border border-t py-5">
            <p className="text-muted-foreground font-mono text-xs">
              {new Date(n.createdAt).toISOString().replace('T', ' ').slice(0, 16)} · via {n.channel}
              {n.trigger.source && <span> · {n.trigger.source}</span>}
              {n.sentAt === null && (
                <span style={{ color: 'var(--negative)' }}>
                  {' '}
                  · not delivered, kept on the record
                </span>
              )}
            </p>
            {n.trigger.reason && (
              <p className="text-muted-foreground mt-1 text-sm">
                Trigger: {n.trigger.reason.replace(/_/g, ' ')}
              </p>
            )}
            <pre className="border-border text-muted-foreground bg-muted mt-3 overflow-x-auto border-l-2 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {n.body}
            </pre>
          </li>
        ))}
      </ol>

      <p className="border-border text-muted-foreground mt-8 max-w-[64ch] border-t pt-4 text-sm">
        A message that fails to send is shown here as undelivered rather than disappearing. A
        dropped notification you cannot see is worse than one you can.
      </p>
    </main>
  );
}
