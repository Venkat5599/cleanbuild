'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/header';
import { ThemeSwitch } from '@/components/theme-switch';
import type { ReactNode } from 'react';

/**
 * The marketing header belongs to the marketing pages.
 *
 * The dashboard carries its own dense navigation, and rendering both produces
 * two nav bars stacked on top of each other. This picks one.
 */
export function SiteChrome(): ReactNode {
  const pathname = usePathname();
  if (pathname?.startsWith('/dashboard')) return null;

  return (
    <>
      <Header />
      <ThemeSwitch />
    </>
  );
}
