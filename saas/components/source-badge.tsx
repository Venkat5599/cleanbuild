import type { Source } from '@/lib/ratchet';
import type { ReactNode } from 'react';

/**
 * Says where the numbers on this page came from.
 *
 * Present on every data page, live or not. A dashboard reading a snapshot and
 * not saying so is presenting stale numbers as current, which is the one thing
 * a page about evidence must not do.
 */
export function SourceBadge({ source }: { source: Source }): ReactNode {
  if (source.live) {
    return (
      <span className="text-muted-foreground font-mono text-xs">reading the live Worker</span>
    );
  }
  return (
    <span className="text-muted-foreground font-mono text-xs">
      snapshot of a verified run, captured {source.capturedAt?.slice(0, 10)}
    </span>
  );
}
