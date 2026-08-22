import { createFileRoute } from '@tanstack/react-router';
import { DEMO_CREATOR_ID, api } from '../lib/api';

export const Route = createFileRoute('/notifications')({
  loader: () => api.notifications({ creatorId: DEMO_CREATOR_ID, limit: 30 }),
  component: Notifications,
  pendingComponent: () => (
    <div className="state">
      <strong>Reading follow-ups.</strong>
    </div>
  ),
});

function Notifications() {
  const rows = Route.useLoaderData();

  if (rows.length === 0) {
    return (
      <main>
        <header className="section-head">
          <div>
            <h1>Autonomous follow-ups</h1>
          </div>
        </header>
        <div className="state">
          <strong>No follow-ups yet.</strong>
          <p className="dim">
            Nothing is sent until a belief change is worth interrupting someone for: a feature
            crossing 90% confidence, a settled belief reversing, or one result moving a weight
            unusually far. Ordinary posts move beliefs slightly and stay in the dashboard.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className="section-head">
        <div>
          <h1>Autonomous follow-ups</h1>
          <p className="lede">
            Composed by a scheduled job with nobody logged in. The message goes to the Mind, which
            decides how and when to reach the creator.
          </p>
        </div>
        <p className="meta">
          <span className="num">{rows.filter((r) => r.sentAt !== null).length}</span> delivered ·{' '}
          <span className="num">{rows.filter((r) => r.sentAt === null).length}</span> undelivered
        </p>
      </header>

      <ol className="log">
        {rows.map((n) => {
          const trigger = (n.trigger ?? {}) as { reason?: string; source?: string };
          return (
            <li key={n.id} className="log__entry">
              <p className="meta">
                {new Date(n.createdAt).toISOString().replace('T', ' ').slice(0, 16)}
                <span className="faint"> · via {n.channel}</span>
                {trigger.source && <span className="faint"> · {trigger.source}</span>}
                {n.sentAt === null && (
                  <span className="neg"> · not delivered, kept on the record</span>
                )}
              </p>
              {trigger.reason && <p className="dim">Trigger: {trigger.reason.replace(/_/g, ' ')}</p>}
              <pre className="log__body">{n.body}</pre>
            </li>
          );
        })}
      </ol>

      <p className="footnote">
        A message that fails to send is shown here as undelivered rather than disappearing. A
        dropped notification you cannot see is worse than one you can.
      </p>
    </main>
  );
}
