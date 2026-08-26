"use client";

import { motion, type Transition } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import snapshot from "@/lib/snapshot.json";

const EASE = [0.23, 1, 0.32, 1] as const;

const cardAnimation = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-100px" },
};

const getCardTransition = (delay = 0): Transition => ({
  duration: 0.8,
  ease: EASE,
  delay,
});

const NUM = "font-mono tabular-nums";

/**
 * The landing's product grid.
 *
 * Every number here is read from the labelled capture the dashboard also
 * falls back to (lib/snapshot.json) — the same real pipeline output, never
 * invented. The bento is a condensed version of the dashboard, not a
 * marketing page: it shows the model state, the loop, and the record.
 */
function FeatureCard({
  title,
  body,
  number,
  tag,
  delay = 0,
  children,
  href,
  tone = "default",
}: {
  title: string;
  body: string;
  number?: string;
  tag?: string;
  delay?: number;
  children?: ReactNode;
  href?: string;
  tone?: "default" | "primary";
}): ReactNode {
  const inner = (
    <motion.div
      {...cardAnimation}
      transition={getCardTransition(delay)}
      className={`group relative flex h-full flex-col justify-between overflow-hidden rounded-4xl p-7 ${
        tone === "primary"
          ? "bg-card-primary text-[#131210]"
          : "bg-card-secondary text-card-foreground"
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-4">
          <p
            className={`font-mono text-xs ${
              tone === "primary" ? "text-[#131210]/70" : "text-card-foreground-muted"
            }`}
          >
            {tag ?? ""}
          </p>
          {href && (
            <ArrowUpRight
              className={`size-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${
                tone === "primary" ? "text-[#131210]/60" : "text-muted-foreground"
              }`}
            />
          )}
        </div>
        <h3 className="mt-6 text-2xl font-medium leading-tight">{title}</h3>
        <p
          className={`mt-2 max-w-[36ch] text-sm ${
            tone === "primary" ? "text-[#131210]/80" : "text-muted-foreground"
          }`}
        >
          {body}
        </p>
      </div>
      {children}
      {number && (
        <p className={`${NUM} text-4xl leading-none`}>{number}</p>
      )}
    </motion.div>
  );

  if (!href) return inner;
  return <Link href={href} className="block h-full">{inner}</Link>;
}

/** Condensed interval field: the strongest effects with their 95% CIs. */
function IntervalPreview(): ReactNode {
  type Entry = {
    name: string;
    mean: number;
    ciLow: number;
    ciHigh: number;
    probPositive: number;
  };
  const marginals = (snapshot.posterior.marginals as Entry[])
    .slice()
    .sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean))
    .slice(0, 6);
  const domain = 1.4;

  return (
    <div className="mt-7 space-y-2.5">
      {marginals.map((m) => {
        const span = m.ciHigh - m.ciLow;
        const left = ((m.ciLow + domain) / (2 * domain)) * 100;
        const width = (span / (2 * domain)) * 100;
        const pos = m.mean >= 0;
        return (
          <div key={m.name} className="flex items-center gap-3">
            <span className="w-36 shrink-0 truncate text-xs text-muted-foreground">
              {m.name.split(":")[1]}
            </span>
            <div className="relative h-2 flex-1 rounded-full bg-muted">
              <div
                className="absolute top-1/2 h-full -translate-y-1/2 rounded-full"
                style={{
                  left: `${left}%`,
                  width: `${Math.max(width, 1)}%`,
                  background: pos ? "var(--accent)" : "var(--negative)",
                  opacity: pos ? 0.85 : 0.85,
                }}
              />
              <div
                className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-foreground/60"
                style={{ left: `${((m.mean + domain) / (2 * domain)) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-[11px] text-muted-foreground">
        {snapshot.posterior.nObs} closed experiments · strongest effects, 95% credible intervals
        (labelled snapshot, {new Date(snapshot.capturedAt as string).toISOString().slice(0, 10)})
      </p>
    </div>
  );
}

export function FeaturesBento(): ReactNode {
  const p = snapshot.posterior as {
    nObs: number;
    shrinkageOwn: number;
    marginals: Array<{ probPositive: number }>;
  };
  const confident = p.marginals.filter((m) => m.probPositive >= 0.9 || m.probPositive <= 0.1).length;
  const ownPct = Math.round(p.shrinkageOwn * 100);
  const briefs = snapshot.briefs as Array<{ status: string; headline: string }>;
  const gate = snapshot.gateEvents as Array<{ verdict: string }>;
  const blocks = gate.filter((g) => g.verdict === "block").length;
  const proposed = briefs.filter((b) => b.status === "proposed").length;

  return (
    <section className="w-full px-6 mb-32 bg-background">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            tag="the model"
            title="It remembers what worked"
            body="Every closed experiment narrows what the model believes about this audience. The grey shows nothing — no neural net is hiding in here; the arithmetic is deterministic TypeScript."
            tone="primary"
            href="/dashboard/posterior"
            delay={0}
          >
            <IntervalPreview />
          </FeatureCard>

          <FeatureCard
            tag="the loop"
            title="Four steps, three unsupervised"
            body="Publish. The post becomes an experiment with a feature vector. Metrics mature at 24h, 72h and 168h. The 168h close teaches. Nothing requires a browser."
            number={String(p.nObs)}
            href="/dashboard"
            delay={0.05}
          />

          <FeatureCard
            tag="the record"
            title="A ledger, not a vibe"
            body="Every post, its feature vector, and the reward after the confounds are removed. Rewards are residuals in standard deviations: mean 0, sd 1 by construction."
            href="/dashboard/ledger"
            delay={0.1}
          />

          <FeatureCard
            tag="the memory"
            title="Beliefs change out loud"
            body="The next brief is drawn from the posterior, one draw per round, and the belief diff is written in plain language before anything is surfaced."
            number={`${confident} settled`}
            href="/dashboard/learned"
            delay={0.05}
          />

          <FeatureCard
            tag="the canon gate"
            title="Drafts that contradict the record are blocked"
            body="A draft that repeats a hook inside its cooldown, reuses a format the evidence ruled out, or overlaps something the creator already said is blocked with an explanation."
            number={`${blocks} blocks on record`}
            href="/dashboard/gate"
            delay={0.1}
          />

          <FeatureCard
            tag="the mix"
            title="Your data, your prior"
            body={`${ownPct}% of what the model believes comes from this creator's own history; the rest from the niche prior. The split is shown, never hidden.`}
            number={`${ownPct}% own data`}
            href="/dashboard/posterior"
            delay={0.15}
          />

          <FeatureCard
            tag="the act step"
            title="What to make next"
            body="Briefs are proposals, drawn with exploration: a capped share deliberately test high-variance corners, because a belief that is wrong only gets found out by trying."
            number={`${proposed} proposed`}
            href="/dashboard/briefs"
            delay={0.15}
          />

          <FeatureCard
            tag="the follow-up"
            title="It interrupts only when it matters"
            body="A belief crossing 90% confidence, a trusted belief reversing, or an unusually large move — one proactive message per day at most, composed from the materiality verdict."
            href="/dashboard/follow-ups"
            delay={0.2}
          />
        </div>
      </div>
    </section>
  );
}