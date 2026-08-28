"use client";

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { level, type FeatureExplainView, type TimeTravelView } from '@/lib/ratchet';
import type { IntervalDatum } from '@/components/interval-field';

/**
 * Posterior explorer: re-sort the same marginal data, click a feature to see
 * the experiments that moved it, and compare any two recorded weeks.
 * All data comes from the API through same-origin proxy routes; nothing here
 * recomputes a belief.
 */

type SortMode = 'effect' | 'confidence' | 'uncertainty';

export function PosteriorExplorer({
  data,
  weeks,
}: {
  data: IntervalDatum[];
  weeks: number[];
}): ReactNode {
  const [sort, setSort] = useState<SortMode>('effect');
  const [selected, setSelected] = useState<string | null>(null);
  const [explain, setExplain] = useState<FeatureExplainView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromWeek, setFromWeek] = useState<number | null>(weeks[0] ?? null);
  const [toWeek, setToWeek] = useState<number | null>(weeks[weeks.length - 1] ?? null);
  const [travel, setTravel] = useState<TimeTravelView | null>(null);

  useEffect(() => {
    if (weeks.length >= 2 && fromWeek !== null && toWeek !== null && fromWeek !== toWeek) {
      fetch('/dashboard/posterior/travel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromWeek, toWeek }),
      })
        .then((r) => r.json())
        .then((t) => setTravel(t as TimeTravelView))
        .catch(() => setTravel(null));
    } else {
      setTravel(null);
    }
  }, [fromWeek, toWeek, weeks]);

  const rows = [...data].sort((a, b) => {
    if (sort === 'confidence') return b.probPositive - a.probPositive;
    if (sort === 'uncertainty') return b.ciHigh - b.ciLow - (a.ciHigh - a.ciLow);
    return Math.abs(b.mean) - Math.abs(a.mean);
  });

  const pick = async (name: string) => {
    setSelected(name);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/dashboard/posterior/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature: name }),
      });
      const body = (await res.json()) as FeatureExplainView;
      if (!res.ok) throw new Error((body as unknown as { error?: string }).error ?? `HTTP ${res.status}`);
      setExplain(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setExplain(null);
    } finally {
      setLoading(false);
    }
  };

  const chips: Array<[SortMode, string]> = [
    ['effect', 'by effect size'],
    ['confidence', 'by confidence'],
    ['uncertainty', 'by uncertainty'],
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Sort + week comparison */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sort the posterior">
          {chips.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSort(mode)}
              aria-pressed={sort === mode}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                sort === mode
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {weeks.length >= 2 && (
          <div className="flex items-center gap-2 text-xs">
            <label className="text-muted-foreground">
              week
              <select
                value={fromWeek ?? ''}
                onChange={(e) => setFromWeek(Number(e.target.value))}
                className="border-border bg-background text-foreground ml-1 rounded-lg border px-2 py-1"
              >
                {weeks.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-muted-foreground">→</span>
            <label className="text-muted-foreground">
              week
              <select
                value={toWeek ?? ''}
                onChange={(e) => setToWeek(Number(e.target.value))}
                className="border-border bg-background text-foreground ml-1 rounded-lg border px-2 py-1"
              >
                {weeks.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {travel && (
        <div className="border-border bg-card-secondary/40 rounded-3xl border p-6">
          <p className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
            Week {travel.fromWeek} → week {travel.toWeek} ({travel.fromNObs} → {travel.toNObs} experiments)
          </p>
          <ul className="mt-3 flex list-none flex-col gap-1.5 p-0 text-sm">
            {travel.features
              .filter((f) => Math.abs(f.toMean - f.fromMean) > 0.02 || f.uncertaintyDrop > 0.02)
              .slice(0, 12)
              .map((f) => {
                const flipped = f.fromMean * f.toMean < 0 && Math.abs(f.toMean) > 0.05;
                return (
                  <li key={f.name} className="flex items-baseline justify-between gap-4">
                    <span className={flipped ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                      {level(f.name)}
                      {flipped ? ' · sign flipped' : ''}
                    </span>
                    <span className="font-mono text-xs tabular-nums">
                      <span className="text-muted-foreground">{f.fromMean.toFixed(3)}</span> →{' '}
                      <span className={f.toMean >= 0 ? 'text-foreground' : 'text-muted-foreground'}>
                        {f.toMean.toFixed(3)}
                      </span>
                      {f.uncertaintyDrop > 0 ? (
                        <span className="text-muted-foreground ml-2">±{f.fromSd.toFixed(2)} → ±{f.toSd.toFixed(2)}</span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {/* Clickable feature rows → why */}
      <div className="border-border rounded-3xl border">
        <div className="border-border flex items-baseline justify-between border-b px-5 py-3">
          <p className="text-sm font-medium">Feature explorer</p>
          <p className="text-muted-foreground text-xs">Click a feature to see the experiments behind it</p>
        </div>
        <ul className="flex list-none flex-col p-0">
          {rows.map((m) => {
            const active = selected === m.name;
            const width = Math.min(1, Math.abs(m.mean) / 0.6);
            return (
              <li key={m.name} className="border-border border-b last:border-0">
                <button
                  type="button"
                  onClick={() => pick(m.name)}
                  className={`flex w-full items-center gap-4 px-5 py-2.5 text-left text-sm transition-colors hover:bg-muted/60 ${
                    active ? 'bg-muted/70' : ''
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-foreground">{level(m.name)}</span>
                    <span className="text-muted-foreground block truncate font-mono text-[10px]">
                      {m.name}
                    </span>
                  </span>
                  <span className="text-muted-foreground hidden w-24 text-right font-mono text-xs tabular-nums sm:block">
                    {m.ciLow.toFixed(2)} … {m.ciHigh.toFixed(2)}
                  </span>
                  <span className="bg-muted relative h-1.5 w-28 overflow-hidden rounded-full">
                    <span
                      className="bg-foreground absolute top-0 h-full opacity-70"
                      style={{
                        left: '50%',
                        width: `${Math.max(2, width * 100)}%`,
                        transform: m.mean < 0 ? 'translateX(-100%)' : 'none',
                      }}
                    />
                  </span>
                  <span className="w-14 text-right font-mono text-xs tabular-nums">
                    <span className={m.mean >= 0 ? 'text-foreground' : 'text-muted-foreground'}>
                      {m.mean >= 0 ? '+' : ''}
                      {m.mean.toFixed(2)}
                    </span>
                    <span className="text-muted-foreground block">{(m.probPositive * 100).toFixed(0)}%</span>
                  </span>
                </button>

                {active && (
                  <div className="border-border bg-background border-t px-5 py-4">
                    {loading ? (
                      <p className="text-muted-foreground text-sm">Reading the ledger…</p>
                    ) : error ? (
                      <p className="text-muted-foreground text-sm">{error}</p>
                    ) : explain ? (
                      <div className="flex flex-col gap-3">
                        <p className="text-sm">
                          <span className="text-foreground font-medium">{level(explain.feature)}</span>{' '}
                          posterior μ ={' '}
                          <span className="font-mono tabular-nums">
                            {explain.marginal ? `${explain.marginal.mean >= 0 ? '+' : ''}${explain.marginal.mean.toFixed(3)} ± ${explain.marginal.sd.toFixed(2)}` : '—'}
                          </span>
                          {explain.marginal ? (
                            <span className="text-muted-foreground ml-2">
                              P(helps) {(explain.marginal.probPositive * 100).toFixed(0)}%
                            </span>
                          ) : null}
                        </p>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <p className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
                              Experiments supporting this belief
                            </p>
                            {explain.supporting.length === 0 ? (
                              <p className="text-muted-foreground mt-1 text-xs">No stored diff moved it up.</p>
                            ) : (
                              <ul className="mt-1 flex list-none flex-col gap-1 p-0">
                                {explain.supporting.slice(0, 5).map((s) => (
                                  <li key={s.id} className="text-xs">
                                    {s.experimentId ? (
                                      <Link href={`/dashboard/experiments/${s.experimentId}`} className="text-foreground hover:underline">
                                        experiment #{s.experimentId}
                                      </Link>
                                    ) : (
                                      <span className="text-foreground">ledger entry</span>
                                    )}{' '}
                                    <span className="text-muted-foreground font-mono">Δ{s.delta >= 0 ? '+' : ''}{s.delta.toFixed(3)}</span>{' '}
                                    <span className="text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div>
                            <p className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
                              Experiments against it
                            </p>
                            {explain.against.length === 0 ? (
                              <p className="text-muted-foreground mt-1 text-xs">No stored diff moved it down.</p>
                            ) : (
                              <ul className="mt-1 flex list-none flex-col gap-1 p-0">
                                {explain.against.slice(0, 5).map((s) => (
                                  <li key={s.id} className="text-xs">
                                    {s.experimentId ? (
                                      <Link href={`/dashboard/experiments/${s.experimentId}`} className="text-foreground hover:underline">
                                        experiment #{s.experimentId}
                                      </Link>
                                    ) : (
                                      <span className="text-foreground">ledger entry</span>
                                    )}{' '}
                                    <span className="text-muted-foreground font-mono">Δ{s.delta.toFixed(3)}</span>{' '}
                                    <span className="text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}