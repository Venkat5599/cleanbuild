"use client";

import Link from "next/link";

import type { ReactNode } from "react";

const footerLinks = {
  menu: [
    { label: "Customers", href: "#" },
    { label: "Resources", href: "#" },
    { label: "Careers", href: "#" },
  ],
  company: [
    { label: "Help", href: "#" },
    { label: "Terms", href: "#" },
    { label: "Security", href: "#" },
  ],
  social: [
    { label: "X (Twitter)", href: "#" },
    { label: "LinkedIn", href: "#" },
  ],
};

export function Footer(): ReactNode {
  return (
    <footer className="relative pt-38 mt-24 mx-2.5 max-[850px]:mx-0">
      <div className="absolute left-1/2 -translate-x-1/2 top-0 w-full max-w-5xl">
        <div className="relative w-full rounded-3xl overflow-hidden shadow-2xl/15">
          <div 
            className="absolute inset-0 bg-center bg-no-repeat brightness-150 blur scale-125"
            style={{ background: 'var(--muted)' }}
            aria-hidden="true"
          />
          
          <div className="relative z-10 flex flex-col items-center px-12 py-20 text-center max-[850px]:px-6 max-[850px]:py-12">
            <h2 className="text-foreground mb-6 max-w-2xl text-3xl font-medium tracking-tight max-[850px]:text-2xl">
              Built for Creative Minds Jam #1
            </h2>
            <p className="text-muted-foreground mb-9 max-w-lg leading-relaxed">
              Audience Growth and Engagement track. The learning loop, the agent and the dashboard
              are all in the repository, along with a script that runs the whole autonomous path
              with no browser open.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              <Link
                href="/dashboard"
                className="bg-foreground text-background rounded-xl px-6 py-3 text-sm font-medium transition-opacity hover:opacity-90 active:scale-[0.98]"
              >
                Open the dashboard
              </Link>
              <a
                href="https://github.com/Venkat5599/cleanbuild"
                className="text-muted-foreground hover:text-foreground text-sm transition-colors"
              >
                Read the source
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-accent rounded-tr-[3rem] rounded-tl-[3rem] pt-96 pb-16 max-[850px]:pt-72">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-start justify-between gap-12 max-[850px]:flex-col max-[850px]:gap-10">
            <a href="#" className="flex items-center gap-2" aria-label="RATCHET home">
              <div className="w-8 h-8 rounded-full bg-neutral-900" />
              <span className="text-xl font-semibold text-foreground leading-0">RATCHET</span>
            </a>

            <nav className="flex gap-16 max-[850px]:gap-10 max-[850px]:flex-wrap" aria-label="Footer navigation">
              <div>
                <h3 className="text-xs font-medium text-foreground/50 uppercase tracking-wider mb-4">Menu</h3>
                <ul className="space-y-2">
                  {footerLinks.menu.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="text-sm text-foreground hover:text-foreground/70 transition-colors">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-xs font-medium text-foreground/50 uppercase tracking-wider mb-4">Company</h3>
                <ul className="space-y-2">
                  {footerLinks.company.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="text-sm text-foreground hover:text-foreground/70 transition-colors">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-xs font-medium text-foreground/50 uppercase tracking-wider mb-4">Social</h3>
                <ul className="space-y-2">
                  {footerLinks.social.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="text-sm text-foreground hover:text-foreground/70 transition-colors">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>
          </div>

          <div className="mt-16 pt-6">
            <p className="text-sm text-foreground/50 text-center">
              © {new Date().getFullYear()} RATCHET. Audience Growth and Engagement track.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
