"use client";

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

const HOOKS = ['question', 'claim', 'number_list', 'story_cold_open', 'contrarian', 'demo_first'];
const LENGTHS = ['under_60s', '1_4m', '4_10m', '10_20m', '20m_plus'];
const THUMBS = ['face_reaction', 'text_dominant', 'object_hero', 'before_after', 'none'];
const SLOTS = ['weekday_am', 'weekday_pm', 'weekday_late', 'weekend_am', 'weekend_pm'];
const FORMATS = ['tutorial', 'commentary', 'vlog', 'interview', 'list', 'shorts'];

const LABEL: Record<string, string> = {
  question: 'question opener', claim: 'strong claim', number_list: 'list', story_cold_open: 'cold open',
  contrarian: 'contrarian', demo_first: 'payoff first', under_60s: '<60s', '1_4m': '1-4m', '4_10m': '4-10m',
  '10_20m': '10-20m', '20m_plus': '20m+', face_reaction: 'face', text_dominant: 'text', object_hero: 'object',
  before_after: 'before/after', none: 'none', weekday_am: 'wk am', weekday_pm: 'wk pm', weekday_late: 'wk eve',
  weekend_am: 'we am', weekend_pm: 'we pm', tutorial: 'tutorial', commentary: 'commentary', vlog: 'vlog',
  interview: 'interview', list: 'list', shorts: 'shorts',
};

interface GateResult {
  verdict?: string;
  persisted?: boolean;
  rule?: string;
  overlap?: number;
  explanation?: string;
  note?: string;
  sourceClaim?: { text: string } | null;
  gateEvents?: Array<{ rule: string; verdict: string; explanation: string }>;
  predictedLift?: number;
  ciLow?: number;
  ciHigh?: number;
}

const RULES: Record<string, string> = {
  contradiction: 'Contradiction',
  hook_cooldown: 'Hook cooldown',
  dead_format: 'Dead format',
  embedding: 'Embedding',
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-1 text-[11px] ${
        active ? 'border-foreground bg-foreground text-background' : 'border-border bg-card-secondary text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

export function GateRunner(): ReactNode {
  const router = useRouter();
  const [headline, setHeadline] = useState('');
  const [labels, setLabels] = useState<Record<string, string | number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GateResult | null>(null);

  const pick = (key: string, value: string | number) => {
    setLabels((prev) => ({ ...(prev ?? {}), [key]: value }));
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/dashboard/gate/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline, labels }),
      });
      const body = (await res.json().catch(() => ({}))) as GateResult & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setResult(body);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const rowGroup = (key: string, label: string, options: string[]) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">{label}</span>
      {options.map((o) => (
        <Chip key={o} active={(labels?.[key] ?? '') === o} onClick={() => pick(key, o)}>
          {LABEL[o] ?? o}
        </Chip>
      ))}
    </div>
  );

  return (
    <section className="border-border bg-card-secondary/40 mb-10 rounded-3xl border p-6">
      <h2 className="text-lg font-medium">Run the canon gate on a draft</h2>
      <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed">
        Paste a headline. With no feature vector the contradiction rule is evaluated live against
        the recorded canon (not persisted). Pick the six features to score and gate a full candidate
        — a fresh posterior draw, every rule, persisted to the ledger.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <textarea
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="Paste a draft headline, e.g. “20 minute videos are dead for this channel”"
          rows={2}
          className="border-border bg-background text-foreground w-full resize-none rounded-2xl border px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60"
        />
        {rowGroup('hookType', 'Hook', HOOKS)}
        {rowGroup('format', 'Format', FORMATS)}
        {rowGroup('lengthBucket', 'Length', LENGTHS)}
        {rowGroup('thumbnailArchetype', 'Thumbnail', THUMBS)}
        {rowGroup('publishSlot', 'Slot', SLOTS)}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={busy || headline.trim().length < 4}
            className="bg-foreground text-background rounded-2xl px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Evaluating…' : 'Run the gate'}
          </button>
          {error && <span className="text-muted-foreground text-xs">{error}</span>}
        </div>
      </div>

      {result && (
        <div
          className={`mt-5 rounded-2xl border p-5 ${
            result.verdict === 'BLOCK'
              ? 'border-destructive/40 bg-destructive/5'
              : 'border-foreground/20 bg-foreground/5'
          }`}
        >
          <div className="flex flex-wrap items-baseline gap-3">
            <span className={`font-mono text-2xl font-semibold ${result.verdict === 'BLOCK' ? 'text-destructive' : 'text-foreground'}`}>
              {result.verdict}
            </span>
            {result.persisted ? (
              <span className="text-muted-foreground text-xs">persisted to the ledger</span>
            ) : (
              <span className="text-muted-foreground text-xs">evaluated live, not persisted</span>
            )}
            {typeof result.overlap === 'number' && (
              <span className="text-muted-foreground font-mono text-xs">token overlap {(result.overlap * 100).toFixed(0)}%</span>
            )}
            {typeof result.predictedLift === 'number' && (
              <span className="text-muted-foreground font-mono text-xs">
                predicted {result.predictedLift >= 0 ? '+' : ''}
                {result.predictedLift.toFixed(2)}σ [{result.ciLow?.toFixed(2)}, {result.ciHigh?.toFixed(2)}]
              </span>
            )}
          </div>
          <p className="text-foreground/90 mt-2 text-sm">{result.explanation}</p>
          {result.sourceClaim && (
            <p className="text-muted-foreground mt-1 text-xs">
              Source claim: “{result.sourceClaim.text}”
            </p>
          )}
          {result.gateEvents && result.gateEvents.length > 0 && (
            <ul className="mt-3 flex list-none flex-col gap-1 p-0">
              {result.gateEvents.map((e, i) => (
                <li key={i} className="flex items-baseline gap-3 text-xs">
                  <span className={`font-mono ${e.verdict === 'block' ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {RULES[e.rule] ?? e.rule}: {e.verdict === 'block' ? 'blocked' : 'passed'}
                  </span>
                  <span className="text-muted-foreground">{e.explanation}</span>
                </li>
              ))}
            </ul>
          )}
          {result.note && <p className="text-muted-foreground mt-3 text-xs leading-relaxed">{result.note}</p>}
        </div>
      )}
    </section>
  );
}

export function OverrideButton({ eventId, overridden }: { eventId: number; overridden: boolean }): ReactNode {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(overridden);
  const [err, setErr] = useState<string | null>(null);

  const override = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/dashboard/gate/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setDone(true);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      {done ? (
        <span className="text-muted-foreground font-mono text-[10px]">override recorded</span>
      ) : (
        <button
          type="button"
          onClick={override}
          disabled={busy}
          className="text-muted-foreground hover:text-foreground border-border rounded-lg border px-2 py-0.5 text-[11px] disabled:opacity-50"
        >
          {busy ? '…' : 'Override'}
        </button>
      )}
      {err && <span className="text-muted-foreground text-[10px]">{err}</span>}
    </span>
  );
}