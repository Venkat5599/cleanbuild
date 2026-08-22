'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  Activity,
  BellRing,
  ChartNoAxesColumn,
  FileText,
  Lightbulb,
  Menu,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

/**
 * Dashboard sidebar.
 *
 * Grouped by what the sections are for rather than listed flat: what the agent
 * currently believes, the evidence that produced those beliefs, and what it did
 * on its own. That ordering is the product's argument, so the navigation makes
 * it rather than hiding it behind an alphabetical list.
 *
 * The active item is marked with weight and a filled surface. There is no dot
 * or bar bolted underneath it.
 */

interface Item {
  href: string;
  label: string;
  icon: typeof Activity;
  hint: string;
}

interface Group {
  title: string;
  items: Item[];
}

const GROUPS: Group[] = [
  {
    title: 'Beliefs',
    items: [
      {
        href: '/dashboard',
        label: 'Overview',
        icon: Activity,
        hint: 'Where the model stands right now',
      },
      {
        href: '/dashboard/posterior',
        label: 'Posterior',
        icon: ChartNoAxesColumn,
        hint: 'Every feature with its credible interval',
      },
      {
        href: '/dashboard/learned',
        label: 'What changed',
        icon: Lightbulb,
        hint: 'Belief movements, with their cause',
      },
    ],
  },
  {
    title: 'Evidence',
    items: [
      {
        href: '/dashboard/ledger',
        label: 'Experiments',
        icon: FileText,
        hint: 'Every closed post and its result',
      },
      {
        href: '/dashboard/briefs',
        label: 'Briefs',
        icon: Sparkles,
        hint: 'What to make next, and why',
      },
    ],
  },
  {
    title: 'Autonomy',
    items: [
      {
        href: '/dashboard/follow-ups',
        label: 'Follow-ups',
        icon: BellRing,
        hint: 'Messages sent with nobody logged in',
      },
      {
        href: '/dashboard/gate',
        label: 'Canon gate',
        icon: ShieldCheck,
        hint: 'Drafts blocked before they shipped',
      },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  // "/dashboard" would otherwise match every child route.
  return href === '/dashboard' ? pathname === href : pathname.startsWith(href);
}

export function DashboardSidebar(): ReactNode {
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-7" aria-label="Dashboard sections">
      {GROUPS.map((group) => (
        <div key={group.title}>
          <p className="text-muted-foreground mb-2 px-3 font-mono text-[10px] tracking-[0.16em] uppercase">
            {group.title}
          </p>
          <ul className="flex list-none flex-col gap-0.5 p-0">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    title={item.hint}
                    className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors ${
                      active
                        ? 'bg-card-secondary text-card-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile: a real button, not a decorative icon. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="dashboard-sidebar"
        className="border-border bg-background text-foreground fixed top-4 left-4 z-50 flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm lg:hidden"
      >
        {open ? (
          <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <Menu className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        )}
        Sections
      </button>

      <aside
        id="dashboard-sidebar"
        className={`border-border bg-background fixed inset-y-0 left-0 z-40 w-64 shrink-0 overflow-y-auto border-r px-4 py-6 transition-transform lg:sticky lg:top-0 lg:h-[100dvh] lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Link
          href="/"
          className="text-foreground mb-8 block px-3 font-mono text-sm tracking-[0.14em] transition-opacity hover:opacity-70"
        >
          RATCHET
        </Link>

        {nav}

        <div className="border-border mt-8 border-t px-3 pt-5">
          <p className="text-muted-foreground text-xs leading-relaxed">
            Beliefs update on a schedule, not on refresh. Nothing on these pages can change them.
          </p>
        </div>
      </aside>

      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}
    </>
  );
}
