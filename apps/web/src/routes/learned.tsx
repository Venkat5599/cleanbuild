import { createFileRoute } from '@tanstack/react-router';
import { DEMO_CREATOR_ID, api } from '../lib/api';

export const Route = createFileRoute('/learned')({
  loader: () => api.learned({ creatorId: DEMO_CREATOR_ID, limit: 30 }),
  component: Learned,
  pendingComponent: () => (
    <div className="state">
      <strong>Reading the belief log.</strong>
    </div>
  ),
});

interface Delta {
  name: string;
  before: number;
  after: number;
  delta: number;
  sdBefore: number;
  sdAfter: number;
}

function Learned() {
  const rows = Route.useLoaderData();

  if (rows.length === 0) {
    return (
      <div className="state">
        <strong>Nothing learned yet.</strong>
        <p className="dim">
          Each entry here is written when an experiment closes. The first one appears seven days
          after the first post.
        </p>
      </div>
    );
  }

  return (
    <main>
      <header className="section-head">
        <div>
          <h1>What changed, and why</h1>
          <p className="lede">
            Every belief change is recorded with the experiment that caused it. This is the audit
            trail: nothing moves without a result behind it.
          </p>
        </div>
      </header>

      <ol className="log">
        {rows.map((row) => {
          const deltas = (row.deltas as Delta[]) ?? [];
          return (
            <li key={row.id} className="log__entry">
              <p className="meta">
                {new Date(row.createdAt).toISOString().replace('T', ' ').slice(0, 16)}
                {row.experimentId !== null && (
                  <span className="faint"> · experiment {row.experimentId}</span>
                )}
              </p>
              <p className="log__summary">{row.summary}</p>
              {deltas.length > 0 && (
                <ul className="log__deltas">
                  {deltas.slice(0, 5).map((d) => (
                    <li key={d.name}>
                      <span className="num faint">{d.name.split(':')[1] ?? d.name}</span>
                      <span className={`num ${d.delta >= 0 ? 'pos' : 'neg'}`}>
                        {d.delta >= 0 ? '+' : ''}
                        {d.delta.toFixed(3)}
                      </span>
                      <span className="num faint">
                        uncertainty {d.sdAfter <= d.sdBefore ? 'down' : 'up'} to ±
                        {(1.96 * d.sdAfter).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
