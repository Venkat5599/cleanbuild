import { getNotifications } from '@/lib/ratchet';
import { Empty, PageHead } from '@/components/page-head';
import type { ReactNode } from 'react';

export const metadata = { title: 'Autonomous follow-ups' };

export default async function FollowUpsPage(): Promise<ReactNode> {
  const rows = await getNotifications(30);

  if (rows.length === 0) {
    return (
      <main>
        <PageHead
          title="Autonomous follow-ups"
          lede="Composed by a scheduled job with nobody logged in."
        />
        <Empty
          title="No follow-ups yet."
          body="Nothing is sent until a belief change is worth interrupting someone for: a feature crossing 90% confidence, a settled belief reversing, or one result moving a weight unusually far. Ordinary posts move beliefs slightly and stay in the dashboard."
        />
      </main>
    );
  }

  const delivered = rows.filter((r) => r.sentAt !== null).length;

  return (
    <main>
      <PageHead
        title="Autonomous follow-ups"
        lede="Composed by a scheduled job with nobody logged in. The message goes to the Mind, which decides how and when to reach the creator."
        meta={
          <>
            <span className="text-foreground tabular-nums">{delivered}</span> delivered ·{' '}
            <span className="text-foreground tabular-nums">{rows.length - delivered}</span>{' '}
            undelivered
          </>
        }
      />

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
