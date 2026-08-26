'use client';

import { Header } from '@/components/header';
import type { ReactNode } from 'react';

/**
 * Site chrome.
 *
 * The floating header appears on every route, dashboard included. An earlier
 * version hid it on the dashboard to avoid stacking two navigations, which
 * solved the collision by making the product look like a different website
 * from the page that links to it. The dashboard's own rail now sits below the
 * header rather than competing with it.
 *
 * RATCHET is single-theme (dark ink, per the colour lock); there is no theme
 * switch.
 */
export function SiteChrome(): ReactNode {
  return (
    <>
      <Header />
    </>
  );
}
