import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead } from '@/components/page-head';
import { getExperimentDetail, level, type BeliefDiffRow } from '@/lib/ratchet';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Experiment' };

function fmt(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function sig(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}σ`;
}

function humanCheckpoint(cp: string): string {
  return { '24h': '24h', '72h': '72h', '168h': '168h (close)' }[cp] ?? cp;
}

export default async function ExperimentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;
  const experimentId = Number(id);
  if (!Number.isInteger(experimentId) || experimentId <= 0) notFound();

  let exp: Awaited<ReturnType<typeof getExperimentDetail>>;
  try {
    exp = await getExperimentDetail(experimentId);
  } catch {
    return (
      <div className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-muted-foreground text-sm">
          The API did not answer for experiment #{experimentId}. This page holds no cached copy —
          refresh once the backend is back, or open an experiment from the ledger.
        </p>
        <Link href="/dashboard/ledger" className="text-foreground mt-4 inline-block text-sm underline">
          Back to the ledger
        </Link>
      </div>
    );
  }

  const c = exp.rewardComponents;
  const expectedViews = c ? Math.round(Math.exp(c.predictedLogViews)) : null;
  const finalViews = c ? Math.round(Math.exp(c.actualLogViews)) : null;
  const featureRows: Array<[string, string]> = exp.features
    ? (Object.entries(exp.features) as Array<[string, string | number]>).map(([k, v]) => [k, String(v)])
    : [];

  return (
    <div className="flex flex-col gap-8">
      <PageHead
        title={exp.title}
        lede={`Experiment #${exp.experimentId} · ${exp.status} · published ${new Date(exp.publishedAt).toLocaleString()}`}
      />

      {/* 1. What was published, 2. features, 3. confounds */}
      <section className="border-border bg-card-secondary/40 rounded-3xl border p-6">
        <h2 className="text-lg font-medium">What happened</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">Creative features</p>
            {featureRows.length === 0 ? (
              <p className="text-muted-foreground mt-2 text-sm">No feature record.</p>
            ) : (
              <ul className="mt-2 flex list-none flex-col gap-1 p-0 text-sm">
                {featureRows.map(([k, v]) => (
                  <li key={k} className="flex items-baseline justify-between gap-3">
                    <span className="text-muted-foreground">{k.replaceAll('_', ' ')}</span>
                    <span className="text-foreground font-medium">{v}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">Confounds the baseline knew</p>
            {exp.confounds ? (
              <ul className="mt-2 flex list-none flex-col gap-1 p-0 text-sm">
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Followers at publish</span>
                  <span className="text-foreground">{fmt(exp.confounds.followers)}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Days since previous post</span>
                  <span className="text-foreground">{fmt(exp.confounds.daysSinceLastPost, 1)}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Channel age at publish (days)</span>
                  <span className="text-foreground">{fmt(exp.confounds.timeIndex, 0)}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Local publish time</span>
                  <span className="text-foreground">{new Date(exp.confounds.publishedAt).toLocaleString()}</span>
                </li>
              </ul>
            ) : (
              <p className="text-muted-foreground mt-2 text-sm">Outside the baseline model&apos;s window.</p>
            )}
          </div>
        </div>
      </section>

      {/* 4–6. Residual reward: expected vs actual */}
      <section className="border-border bg-card-secondary/40 rounded-3xl border p-6">
        <h2 className="text-lg font-medium">The residual reward</h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed">
          Raw views mostly measure how big the channel already was. The baseline predicts what this
          channel “should” have earned given the confounds above; the residual is how the post actually
          landed relative to that prediction — measured in standard deviations.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="border-border rounded-2xl border p-5">
            <p className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">Observed (168h)</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{fmt(finalViews)}</p>
          </div>
          <div className="border-border rounded-2xl border p-5">
            <p className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">Baseline expected</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{fmt(expectedViews)}</p>
          </div>
          <div className={`rounded-2xl border p-5 ${exp.reward !== null && exp.reward >= 0 ? 'border-foreground/40 bg-foreground/5' : 'border-border bg-background/40'}`}>
            <p className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">Residual reward</p>
            <p className={`mt-1 text-3xl font-semibold tracking-tight ${exp.reward !== null && exp.reward >= 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
              {exp.reward === null ? '—' : sig(exp.reward)}
              {c?.wasClipped ? <span className="text-muted-foreground ml-2 text-xs">(clipped at ±4σ)</span> : null}
            </p>
            {c ? (
              <p className="text-muted-foreground mt-2 font-mono text-[10px]">
                raw {c.raw.toFixed(2)}σ · residual sd {c.sigmaResid.toFixed(3)} log-views
              </p>
            ) : null}
          </div>
        </div>
        {!c && exp.status !== 'closed' && (
          <p className="text-muted-foreground mt-4 text-sm">
            Not matured yet — checkpoints currently at {fmt(exp.nextCheckpointAt ? Math.max(0, Math.round((exp.nextCheckpointAt - exp.openedAt) / 3_600_000)) : null, 0)}h.
          </p>
        )}
      </section>

      {/* Checkpoints */}
      {exp.checkpoints.length > 0 && (
        <section className="border-border bg-card-secondary/40 rounded-3xl border p-6">
          <h2 className="text-lg font-medium">Checkpoints</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
                  <th className="pb-2 pr-4 font-normal">Checkpoint</th>
                  <th className="pb-2 pr-4 font-normal">Views</th>
                  <th className="pb-2 pr-4 font-normal">Watch time (min)</th>
                  <th className="pb-2 pr-4 font-normal">Comments</th>
                  <th className="pb-2 pr-4 font-normal">Likes</th>
                  <th className="pb-2 font-normal">Follower delta</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {exp.checkpoints.map((m) => (
                  <tr key={m.checkpoint}>
                    <td className="py-2 pr-4">{humanCheckpoint(m.checkpoint)}</td>
                    <td className="py-2 pr-4">{fmt(m.views)}</td>
                    <td className="py-2 pr-4">{fmt(m.watchTime)}</td>
                    <td className="py-2 pr-4">{fmt(m.comments)}</td>
                    <td className="py-2 pr-4">{fmt(m.likes)}</td>
                    <td className="py-2">{fmt(m.followerDelta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 7–8. Belief diffs: what changed in the posterior and why it mattered */}
      <section className="border-border bg-card-secondary/40 rounded-3xl border p-6">
        <h2 className="text-lg font-medium">What changed in the posterior</h2>
        {exp.beliefDiffs.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">
            {exp.status === 'closed'
              ? 'This experiment was folded into the posterior before belief-diff records started.'
              : 'Nothing recorded yet — the diff is written when the experiment closes.'}
          </p>
        ) : (
          <ul className="mt-4 flex list-none flex-col gap-2 p-0">
            {exp.beliefDiffs.map((d) => (
              <li key={d.id} className="border-border rounded-2xl border px-4 py-3">
                <p className="text-sm">{d.summary}</p>
                <ul className="mt-2 flex list-none flex-col gap-1 p-0">
                  {(d.deltas as Array<{ name: string; before: number; after: number; delta: number; sdBefore: number; sdAfter: number }>).map(
                    (e) => (
                      <li key={e.name} className="flex items-baseline justify-between gap-4 text-sm">
                        <span className="text-muted-foreground">{level(e.name)}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {e.before.toFixed(3)} → <span className={e.delta >= 0 ? 'text-foreground' : 'text-muted-foreground'}>{e.after.toFixed(3)}</span>{" "}
                          <span className={e.delta >= 0 ? 'text-foreground' : 'text-muted-foreground'}>Δ{e.delta >= 0 ? '+' : ''}{e.delta.toFixed(3)}</span>
                          <span className="ml-2">±{e.sdAfter.toFixed(2)}</span>
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href="/dashboard/ledger" className="text-muted-foreground hover:text-foreground text-sm underline">
        ← Back to the experiment ledger
      </Link>
    </div>
  );
}

export type { BeliefDiffRow };