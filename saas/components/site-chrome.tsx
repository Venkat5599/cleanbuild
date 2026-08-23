'use client';

import { Header } from '@/components/header';
import { ThemeSwitch } from '@/components/theme-switch';
import type { ReactNode } from 'react';

/**
 * Site chrome.
 *
 * The floating header and theme switch appear on every route, dashboard
 * included. An earlier version hid them on the dashboard to avoid stacking two
 * navigations, which solved the collision by making the product look like a
 * different website from the page that links to it. The dashboard's own rail
 * now sits below the header rather than competing with it.
 */
export function SiteChrome(): ReactNode {
  return (
    <>
      <Header />
      <ThemeSwitch />
    </>
  );
}
