"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

/**
 * Try the loop — the interactive sandbox.
 *
 * The live ledger is read-only by design; this page gives you the product to
 * operate. Every action here runs the REAL pipeline code (maturation, the
 * baseline, the posterior update, the canon gate, follow-up) against an
 * isolated scratch database. Metrics generated inside the sandbox are
 * simulated from the creator's fitted baseline — this is the pipeline working,
 * not a real platform feed — and the page says so.
 */

interface ExperimentView {
  id: number;
  postId: number;
  status: string;
  openedAt: string;
  nextCheckpointAt: string | null;
}
interface NotificationView {
  channel: string;
  body: string;
  sentAt: string | null;
}
interface State {
  ready: boolean;
  experiments: ExperimentView[];
  notifications: NotificationView[];
  posteriorN: number;
}

const HOOKS = ["question", "claim", "number_list", "story_cold_open", "contrarian", "demo_first"];
const LENGTHS = ["under_60s", "1_4m", "4_10m", "10_20m", "20m_plus"];
const THUMBS = ["face_reaction", "text_dominant", "object_hero", "before_after", "none"];
const SLOTS = ["weekday_am", "weekday_pm", "weekday_late", "weekend_am", "weekend_pm"];
const FORMATS = ["tutorial", "commentary", "vlog", "interview", "list", "shorts"];
const TOPICS = Array.from({ length: 8 }, (_, i) => i);

const LABEL: Record<string, string> = {
  question: "question opener",
  claim: "strong claim",
  number_list: "numbered list",
  story_cold_open: "cold-open story",
  contrarian: "contrarian take",
  demo_first: "payoff first",
  under_60s: "under 60s",
  "1_4m": "1-4 min",
  "4_10m": "4-10 min",
  "10_20m": "10-20 min",
  "20m_plus": "20+ min",
  face_reaction: "face reaction",
  text_dominant: "text dominant",
  object_hero: "object hero",
  before_after: "before/after",
  none: "no portrait",
  weekday_am: "weekday morning",
  weekday_pm: "weekday afternoon",
  weekday_late: "weekday evening",
  weekend_am: "weekend morning",
  weekend_pm: "weekend afternoon",
  tutorial: "tutorial",
  commentary: "commentary",
  vlog: "vlog",
  interview: "interview",
  list: "list",
  shorts: "shorts",
};

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
        active
          ? "border-foreground bg-foreground text-background font-medium"
          : "border-border bg-card-secondary text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(body.error ?? `HTTP ${res.status}`));
  return body;
}

export default function SandboxPage(): ReactNode {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState({
    hookType: HOOKS[0]!,
    lengthBucket: LENGTHS[1]!,
    thumbnailArchetype: THUMBS[0]!,
    publishSlot: SLOTS[1]!,
    format: FORMATS[0]!,
    topicCluster: 2,
  });

  const refresh = useCallback(async () => {
    try {
      const s = (await api("/sandbox/state")) as State;
      setState(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const publish = () =>
    run(() =>
      api("/sandbox/publish", {
        method: "POST",
        body: JSON.stringify({ ...picked, topicCluster: picked.topicCluster }),
      }),
    );

  const advance = () => run(() => api("/sandbox/advance", { method: "POST" }));
  const reset = () => run(() => api("/sandbox/reset", { method: "POST" }));

  const pickers: Array<{
    key: keyof typeof picked;
    label: string;
    options: readonly string[];
  }> = [
    { key: "hookType", label: "Hook", options: HOOKS },
    { key: "format", label: "Format", options: FORMATS },
    { key: "lengthBucket", label: "Length", options: LENGTHS },
    { key: "thumbnailArchetype", label: "Thumbnail", options: THUMBS },
    { key: "publishSlot", label: "Publish slot", options: SLOTS },
  ];

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Try the loop</h1>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          The live ledger is read-only by design. This page is an isolated
          scratch database running the <em>same pipeline code</em> — publish a
          post, fast-forward the clock, and watch it open, mature, update the
          posterior, and decide. Metrics here are simulated from the
          creator&apos;s fitted baseline (labelled, never claimed as real
          platform data); nothing touches the live ledger.
        </p>
      </header>

      {error && (
        <p className="border-destructive bg-destructive/10 text-destructive rounded-xl border px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* Publish */}
        <div className="border-border bg-card-secondary/40 flex flex-col gap-5 rounded-3xl border p-6">
          <div>
            <h2 className="text-lg font-medium">Publish a post</h2>
            <p className="text-muted-foreground text-xs">
              Choose the creative features. The experiment opens with exactly this vector.
            </p>
          </div>

          {pickers.map(({ key, label, options }) => (
            <label key={key} className="flex flex-col gap-2">
              <span className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
                {label}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {options.map((opt) => (
                  <Chip
                    key={opt}
                    active={picked[key] === opt}
                    onClick={() => setPicked((p) => ({ ...p, [key]: opt }))}
                  >
                    {LABEL[opt] ?? opt}
                  </Chip>
                ))}
              </div>
            </label>
          ))}

          <label className="flex flex-col gap-2">
            <span className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
              Topic cluster
            </span>
            <div className="flex flex-wrap gap-1.5">
              {TOPICS.map((t) => (
                <Chip key={t} active={picked.topicCluster === t} onClick={() => setPicked((p) => ({ ...p, topicCluster: t }))}>
                  topic {t + 1}
                </Chip>
              ))}
            </div>
          </label>

          <button
            type="button"
            onClick={publish}
            disabled={busy}
            className="bg-foreground text-background mt-2 rounded-2xl px-5 py-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Working…" : "Publish experiment"}
          </button>
        </div>

        {/* Time machine + ledger */}
        <div className="flex flex-col gap-6">
          <div className="border-border bg-card-secondary/40 flex items-center justify-between gap-4 rounded-3xl border p-6">
            <div>
              <h2 className="text-lg font-medium">Fast-forward</h2>
              <p className="text-muted-foreground text-xs">
                Each press simulates the next 24h of the hourly cron: metrics
                land at the due checkpoint, the posterior updates at 168h, and
                follow-up decides whether anyone is interrupted.
              </p>
            </div>
            <button
              type="button"
              onClick={advance}
              disabled={busy || !state?.ready}
              className="bg-foreground text-background shrink-0 rounded-2xl px-5 py-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              +24h
            </button>
          </div>

          <div className="border-border bg-card-secondary/40 rounded-3xl border p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Your sandbox ledger</h2>
              <button
                type="button"
                onClick={reset}
                disabled={busy}
                className="text-muted-foreground hover:text-foreground border-border rounded-xl border px-3 py-1.5 text-xs transition-colors"
              >
                Reset (wipes this scratch db)
              </button>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {state?.posteriorN
                ? `${state.posteriorN} observations in the sandbox posterior.`
                : "Nothing published yet — the poster below starts with a small synthetic history so the baseline exists."}
            </p>

            <ul className="mt-4 flex list-none flex-col gap-2 p-0">
              {(state?.experiments ?? []).length === 0 && (
                <li className="text-muted-foreground text-sm">No experiments yet.</li>
              )}
              {state?.experiments.map((e) => (
                <li
                  key={e.id}
                  className="border-border flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm"
                >
                  <span className="text-muted-foreground font-mono text-xs">#{e.id}</span>
                  <span className="flex-1">
                    {e.status === "closed" ? (
                      <span className="text-foreground">closed · taught the posterior</span>
                    ) : e.status === "void" ? (
                      <span className="text-muted-foreground">voided</span>
                    ) : (
                      <span className="text-foreground">
                        open · next checkpoint{" "}
                        {e.nextCheckpointAt
                          ? new Date(e.nextCheckpointAt).toLocaleString()
                          : "—"}
                      </span>
                    )}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 font-mono text-[10px] tracking-wider uppercase ${
                      e.status === "closed"
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {e.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-border bg-card-secondary/40 rounded-3xl border p-6">
            <h2 className="text-lg font-medium">Follow-ups from the sandbox</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              If the posterior crosses the materiality gate, the real delivery
              path runs — Mind if configured, Telegram as fallback, or
              &quot;stored&quot; when no channel is set. Rate-limited 1/24h by the
              same ledger as production.
            </p>
            <ul className="mt-3 flex list-none flex-col gap-2 p-0">
              {(state?.notifications ?? []).length === 0 && (
                <li className="text-muted-foreground text-sm">
                  Nothing material yet. Ordinary posts move beliefs slightly and are
                  correctly not worth interrupting anyone for.
                </li>
              )}
              {state?.notifications.map((n, i) => (
                <li key={i} className="text-muted-foreground text-sm leading-relaxed">
                  <span className="text-foreground font-medium">
                    {n.channel === "telegram" ? "Telegram" : n.channel === "mind" ? "Mind" : "Stored"}
                  </span>{" "}
                  · {n.sentAt ? new Date(n.sentAt).toLocaleString() : "delivered: no (stored)"}
                  <span className="block text-xs"> {n.body}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}