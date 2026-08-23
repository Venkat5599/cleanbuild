import { DashboardSidebar } from '@/components/dashboard-sidebar';
import type { ReactNode } from 'react';

/**
 * Dashboard shell.
 *
 * A persistent left rail, and one route per thing the agent does. Splitting
 * them apart rather than stacking everything on one screen means a link points
 * at a specific claim, which matters when the point of the product is that
 * every belief has a traceable cause.
 */
export default function DashboardLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="flex min-h-[100dvh]">
      <DashboardSidebar />
      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1080px] px-6 pt-28 pb-16 max-lg:pt-24">{children}</div>
      </div>
    </div>
  );
}
