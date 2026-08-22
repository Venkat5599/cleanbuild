import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Dashboard shell.
 *
 * Deliberately denser than the marketing pages: hairlines instead of cards,
 * mono for every number, no decorative chrome. It is an instrument panel and
 * should read as one, while staying on the same palette and typeface as the
 * rest of the site so it does not feel like a different product.
 */

const NAV = [
  { href: '/dashboard', label: 'Posterior' },
  { href: '/dashboard/ledger', label: 'Ledger' },
  { href: '/dashboard/learned', label: 'Learned' },
  { href: '/dashboard/follow-ups', label: 'Follow-ups' },
] as const;

export default function DashboardLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-6 pb-24">
      <nav
        aria-label="Dashboard"
        className="border-border flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b pt-8 pb-4"
      >
        <Link
          href="/"
          className="text-foreground mr-auto font-mono text-sm tracking-[0.14em] transition-opacity hover:opacity-70"
        >
          RATCHET
        </Link>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="pt-10">{children}</div>
    </div>
  );
}
