import Link from 'next/link';
import { PageHead } from '@/components/page-head';
import { getMemory, level } from '@/lib/ratchet';
import { SourceBadge } from '@/components/source-badge';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Mind memory' };

/**
 * What the Mind remembers — every entry here is a stored row: the canon of
 * claims, chosen briefs, the notification history, and the features it is
 * most certain about. Where a section is empty (no recurring bits recorded
 * yet), it says so instead of inventing content.
 */
export default async function MemoryPage(): Promise<ReactNode> {
  let memory: Awaited<ReturnType<typeof getMemory>> | null = null;
  let live = false;
  try {
    memory = await getMemory();
    live = true;
  } catch {
    // No snapshot equivalent — offline must be honest.
  }

  if (!memory) {
    return (
      <main className="flex flex-col gap-6">
        <PageHead
          meta={<SourceBadge source={{ live: false }} />}
          title="Mind memory"
          lede="What the Mind remembers."
        />
        <p className="border-border text-muted-foreground max-w-[60ch] rounded-2xl border p-6 text-sm">
          The API did not answer. This page reads the stored memory tables directly and has no
          captured substitute — refresh once the API is back.
        </p>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-10">
      <PageHead
        meta={<SourceBadge source={{ live }} />}
        title="Mind memory"
        lede="What the Mind remembers about this creator and its own history. Every entry is a stored row."
      />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="border-border bg-card-secondary/40 rounded-3xl border p-6">
          <h2 className="text-lg font-medium">Canon — what the creator has said</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            These claims are what the canon gate checks drafts against.
          </p>
          {memory.claims.length === 0 ? (
            <p className="text-muted-foreground mt-3 text-sm">No claims recorded yet.</p>
          ) : (
            <ul className="mt-3 flex list-none flex-col gap-2 p-0">
              {memory.claims.map((c) => (
                <li key={c.id} className="border-border rounded-2xl border px-4 py-3">
                  <p className="text-sm leading-relaxed">“{c.text}”</p>
                  <p className="text-muted-foreground mt-1 font-mono text-[10px]">
                    stated {new Date(c.statedAt).toLocaleString()}
                    {c.postId ? ` · post #${c.postId}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-border bg-card-secondary/40 rounded-3xl border p-6">
          <h2 className="text-lg font-medium">Recurring bits</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Repeated elements in the creator&apos;s work, with the last time each was used.
          </p>
          {memory.bits.length === 0 ? (
            <p className="text-muted-foreground mt-3 text-sm">
              No recurring bits recorded yet — the extractor has not been run for this creator.
            </p>
          ) : (
            <ul className="mt-3 flex list-none flex-col gap-2 p-0">
              {memory.bits.map((b) => (
                <li key={b.id} className="border-border rounded-2xl border px-4 py-3">
                  <p className="text-sm font-medium">{b.name}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">{b.description}</p>
                  <p className="text-muted-foreground mt-1 font-mono text-[10px]">
                    last used {b.lastUsedAt ? new Date(b.lastUsedAt).toLocaleString() : 'never'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="border-border bg-card-secondary/40 rounded-3xl border p-6">
          <h2 className="text-lg font-medium">Chose to propose</h2>
          <p className="text-muted-foreground mt-1 text-xs">Briefs surfaced by the act step.</p>
          {memory.briefs.length === 0 ? (
            <p className="text-muted-foreground mt-3 text-sm">No briefs yet — run Generate briefs.</p>
          ) : (
            <ul className="mt-3 flex list-none flex-col gap-2 p-0">
              {memory.briefs.map((b) => (
                <li key={b.id} className="text-sm leading-relaxed">
                  <span className="text-foreground">{b.headline}</span>{' '}
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {b.status} · {b.isExploratory ? 'explore' : 'exploit'} · {new Date(b.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-border bg-card-secondary/40 rounded-3xl border p-6">
          <h2 className="text-lg font-medium">Notification history</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Follow-ups composed with nobody logged in. Undelivered rows are kept on purpose.
          </p>
          {memory.notifications.length === 0 ? (
            <p className="text-muted-foreground mt-3 text-sm">
              Nothing material enough to interrupt anyone yet.
            </p>
          ) : (
            <ul className="mt-3 flex list-none flex-col gap-2 p-0">
              {memory.notifications.map((n) => (
                <li key={n.id} className="border-border rounded-2xl border px-4 py-3">
                  <p className="text-xs leading-relaxed">{n.body}</p>
                  <p className="text-muted-foreground mt-1 font-mono text-[10px]">
                    {n.channel} · {n.sentAt ? 'delivered' : 'composed, not delivered'} ·{' '}
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="border-border bg-card-secondary/40 rounded-3xl border p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-medium">Most certain beliefs</h2>
          <p className="text-muted-foreground text-xs">
            cadence {memory.cadence.toFixed(1)} posts/week
          </p>
        </div>
        <ul className="mt-3 flex list-none flex-col gap-1.5 p-0">
          {memory.learnedTop.map((f) => (
            <li key={f.name} className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{level(f.name)}</span>
              <span className="font-mono text-xs tabular-nums">
                <span className={f.mean >= 0 ? 'text-foreground' : 'text-muted-foreground'}>
                  {f.mean >= 0 ? '+' : ''}
                  {f.mean.toFixed(3)}
                </span>{' '}
                <span className="text-muted-foreground">±{f.sd.toFixed(2)} · P(helps) {(f.probPositive * 100).toFixed(0)}%</span>
              </span>
            </li>
          ))}
        </ul>
        <Link href="/dashboard/posterior" className="text-muted-foreground hover:text-foreground mt-4 inline-block text-xs underline">
          Explore the full posterior →
        </Link>
      </section>
    </main>
  );
}