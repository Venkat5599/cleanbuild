import { createFileRoute } from '@tanstack/react-router';
import { DEMO_CREATOR_ID, api } from '../lib/api';

export const Route = createFileRoute('/ledger')({
  loader: () => api.ledger({ creatorId: DEMO_CREATOR_ID, limit: 100 }),
  component: Ledger,
  pendingComponent: () => (
    <div className="state">
      <strong>Reading the ledger.</strong>
    </div>
  ),
});

/** Feature names arrive as "dimension:level". Only the level is worth showing. */
function levels(names: string[]): string {
  return names.map((n) => n.split(':')[1] ?? n).join('  ');
}

function Ledger() {
  const rows = Route.useLoaderData();

  if (rows.length === 0) {
    return (
      <div className="state">
        <strong>No closed experiments yet.</strong>
        <p className="dim">
          A post enters the ledger seven days after it is published, once its result has settled.
        </p>
      </div>
    );
  }

  return (
    <main>
      <header className="section-head">
        <div>
          <h1>Experiment ledger</h1>
          <p className="lede">
            Every published post, with the creative choices it made and how far it landed from its
            own predicted baseline.
          </p>
        </div>
        <p className="meta">
          <span className="num">{rows.length}</span> shown
        </p>
      </header>

      <div className="scroll-x">
        <table>
          <thead>
            <tr>
              <th>Published</th>
              <th>Title</th>
              <th>Choices</th>
              <th style={{ textAlign: 'right' }}>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.experimentId}>
                <td className="num faint">
                  {new Date(r.publishedAt).toISOString().slice(0, 10)}
                </td>
                <td>{r.title}</td>
                <td className="num faint">{levels(r.features)}</td>
                <td
                  className={`num ${r.reward >= 0 ? 'pos' : 'neg'}`}
                  style={{ textAlign: 'right', whiteSpace: 'nowrap' }}
                >
                  {r.reward >= 0 ? '+' : ''}
                  {r.reward.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="footnote">
        Result is measured in standard deviations against what this channel was expected to do
        given its follower count, the day, the hour and the gap since the last post. Raw view
        counts are not used, because they mostly measure how big the channel already was.
      </p>
    </main>
  );
}
