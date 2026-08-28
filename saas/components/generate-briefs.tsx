"use client";

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

/**
 * Run the act step on demand: the same code the nightly cron runs. It draws
 * theta, ranks candidates, gates the draft and persists briefs + verdicts to
 * the ledger. It never moves the posterior — beliefs are still written only
 * by the maturation job.
 */
export function GenerateBriefsButton(): ReactNode {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/dashboard/briefs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rounds: 3 }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; generated?: number };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="bg-foreground text-background rounded-2xl px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Drawing theta…' : 'Generate next briefs'}
      </button>
      {error && <span className="text-muted-foreground text-xs">{error}</span>}
    </div>
  );
}