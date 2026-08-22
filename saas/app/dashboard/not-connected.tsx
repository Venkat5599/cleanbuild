import type { ReactNode } from 'react';

/**
 * Shown when the Worker is not reachable.
 *
 * The dashboard is a window onto a running system. When that system is not
 * running, saying so plainly is more useful than an empty page that looks
 * identical to a creator with no data.
 */
export function NotConnected(): ReactNode {
  return (
    <div className="bg-card-secondary text-card-foreground-muted rounded-4xl p-8">
      <p className="text-card-foreground font-medium">The API is not reachable.</p>
      <p className="mt-2 max-w-[56ch] text-sm leading-relaxed">
        This dashboard reads from the RATCHET Worker, which owns the ledger and the model. Nothing
        here is cached in the page itself, so when the Worker is down there is genuinely nothing to
        show.
      </p>
      <p className="mt-3 max-w-[56ch] font-mono text-xs">
        Start it locally with <span className="text-card-foreground">bun run --cwd apps/api dev</span>
        , or point <span className="text-card-foreground">RATCHET_API_URL</span> at a deployed one.
      </p>
    </div>
  );
}
