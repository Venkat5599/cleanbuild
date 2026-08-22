import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/about')({
  component: About,
});

function About() {
  return (
    <main className="prose">
      <h1>Creators optimise by vibes and survivorship bias</h1>

      <p className="lede">
        Nobody logs what they tried. Last month's lesson is gone. And the feedback that does
        arrive is confounded: "views went up" is tangled with follower growth, the day of the
        week, seasonality and topic luck, so the lesson people take away is usually the wrong one.
      </p>

      <p>
        RATCHET treats every published post as a formal experiment. It records the creative
        choices as a feature vector, collects the outcome on its own days later, and converts the
        raw numbers into a result measured against what that channel was already expected to do.
        What survives is the part the creator actually controls.
      </p>

      <h2>The four loops</h2>

      <dl className="loops">
        <div>
          <dt>Ingest</dt>
          <dd>
            A new post is detected, labelled, and opened as an experiment with a maturation
            schedule. Re-reading a channel never duplicates a post.
          </dd>
        </div>
        <div>
          <dt>Maturation</dt>
          <dd>
            Outcomes are collected at 24, 72 and 168 hours. Only the seven-day close teaches; the
            earlier points are shown but never learned from. A post whose metrics never arrive is
            voided, not guessed at.
          </dd>
        </div>
        <div>
          <dt>Nightly rebuild</dt>
          <dd>
            The baseline is refitted and the whole belief state is rebuilt from the ledger with an
            exact solve. Any divergence from the running version is reported rather than hidden.
          </dd>
        </div>
        <div>
          <dt>Act</dt>
          <dd>
            The next brief is chosen by sampling from the belief state, under a hard cap on how
            much of the schedule may be spent exploring.
          </dd>
        </div>
      </dl>

      <h2>Where the agent sits</h2>

      <p>
        The Mind owns judgement and memory. It labels posts, decides how much to explore, judges
        whether a result is worth interrupting a human for, and carries the relationship across
        sessions. Deterministic TypeScript owns the arithmetic. That split is deliberate:
        arithmetic inside a language model is a liability, and judgement inside a scheduled job is
        impossible.
      </p>

      <p>
        The autonomous path contains no user code path at all. A scheduled job matures
        experiments, moves the beliefs and briefs the Mind with every browser closed and nobody
        logged in. That is the whole claim, and it is a script anyone can run.
      </p>

      <h2>What this is not</h2>

      <ul className="honest">
        <li>
          The data behind this deployment is synthetic, generated with a known ground truth so the
          learning path can be verified rather than asserted. It is not a real creator's channel.
        </li>
        <li>
          Effect sizes are shrunk toward a niche prior. With a few hundred posts the evidence does
          not justify the full effect, so the ordering is trustworthy well before the magnitudes
          are.
        </li>
        <li>
          One real platform connector, plus a CSV import. Breadth was traded for a loop that
          actually closes.
        </li>
        <li>There is no login. A single creator, for the demonstration.</li>
      </ul>

      <p className="footnote">
        Built for Creative Minds Jam #1, Audience Growth and Engagement track.
      </p>
    </main>
  );
}
