"use client";

import { ReducedMotionProvider } from "@/lib/motion";
import { SmoothScroll } from "@/components/smooth-scroll";
import type { ReactNode } from "react";

/**
 * App providers. RATCHET is a single dark theme (see the colour lock in the
 * plan and `className="dark"` on <html>), so there is no theme provider to
 * mount.
 */
export function Providers({ children }: { children: ReactNode }): ReactNode {
  return (
    <ReducedMotionProvider>
      <SmoothScroll>{children}</SmoothScroll>
    </ReducedMotionProvider>
  );
}