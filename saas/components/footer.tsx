"use client";

import type { ReactNode } from "react";

export function Footer(): ReactNode {
  return (
    <footer className="relative pt-38 mt-24 mx-2.5 max-[850px]:mx-0">
      <div className="bg-accent rounded-tr-[3rem] rounded-tl-[3rem] pt-24 pb-16 px-6">
        <div className="max-w-5xl mx-auto flex items-start justify-between gap-12 max-[850px]:flex-col max-[850px]:gap-10">
          <a href="/" className="flex items-center gap-2" aria-label="RATCHET home">
            <div className="w-8 h-8 rounded-full bg-neutral-900" />
            <span className="text-xl font-semibold text-neutral-900 leading-0">RATCHET</span>
          </a>

          <nav className="flex gap-16 max-[850px]:gap-10 max-[850px]:flex-wrap" aria-label="Product">
            <div>
              <h3 className="text-xs font-medium text-neutral-900/50 uppercase tracking-wider mb-4">Product</h3>
              <ul className="space-y-2">
                <li>
                  <a href="/dashboard" className="text-sm text-neutral-900 hover:text-neutral-900/70 transition-colors">
                    Dashboard
                  </a>
                </li>
                <li>
                  <a href="/dashboard/posterior" className="text-sm text-neutral-900 hover:text-neutral-900/70 transition-colors">
                    The posterior
                  </a>
                </li>
                <li>
                  <a href="/dashboard/gate" className="text-sm text-neutral-900 hover:text-neutral-900/70 transition-colors">
                    Canon gate audit
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/Venkat5599/cleanbuild"
                    className="text-sm text-neutral-900 hover:text-neutral-900/70 transition-colors"
                  >
                    Source
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="max-w-5xl mx-auto mt-16 pt-6">
          <p className="text-sm text-neutral-900/50 text-center">
            © {new Date().getFullYear()} RATCHET. Audience Growth and Engagement track.
          </p>
        </div>
      </div>
    </footer>
  );
}