import { createFileRoute } from '@tanstack/react-router';
import { api } from '../lib/api';

export const Route = createFileRoute('/gate')({
  loader: () => api.gateEvents({ limit: 50 }),
  component: Gate,
  pendingComponent: () => (
    <div className="state">
      <strong>Reading the gate log.</strong>
    </div>
  ),
});

const RULE_LABEL: Record<string, string> = {
  contradiction: 'Contradicts something already said',
  hook_cooldown: 'Hook used too recently',
  dead_format: 'Format the evidence says does not work',
};

function Gate() {
  const rows = Route.useLoaderData();

  return (
    <main>
      <header className="section-head">
        <div>
          <h1>Canon gate</h1>
          <p className="lede">
            Before a brief is surfaced it is checked against everything this creator has already
            said publicly, which hooks are still cooling down, and which formats the posterior has
            ruled out.
          </p>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="state">
          <strong>Nothing has been blocked.</strong>
          <p className="dim">
            An empty log is the expected state. The gate only writes an entry when a draft brief
            actually conflicts with the record.
          </p>
        </div>
      ) : (
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Rule</th>
                <th>Verdict</th>
                <th>Explanation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="num faint">
                    {new Date(r.createdAt).toISOString().slice(0, 10)}
                  </td>
                  <td>{RULE_LABEL[r.rule] ?? r.rule}</td>
                  <td className={r.verdict === 'block' ? 'neg' : 'dim'}>
                    {r.verdict === 'block' ? 'Blocked' : 'Passed'}
                    {r.overridden && <span className="faint"> · overridden</span>}
                  </td>
                  <td className="dim">{r.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="footnote">
        A block can always be overridden. The override is recorded, because a creator disagreeing
        with the gate is itself information.
      </p>
    </main>
  );
}
