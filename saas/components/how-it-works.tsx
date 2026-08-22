"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { PenLine, Timer, Scale, Send } from "lucide-react";
import { howItWorksConfig } from "@/lib/config";
import type { ReactNode } from "react";

/**
 * The actual lifecycle of one experiment. Only the first step involves a
 * person; the rest run on a schedule with nobody logged in.
 */
const steps = [
  {
    icon: PenLine,
    title: "You publish",
    description:
      "The post is logged as an experiment with the creative choices it made: hook, length, thumbnail, slot, format, topic. Nothing else happens yet.",
  },
  {
    icon: Timer,
    title: "It waits",
    description:
      "Results are collected at 24, 72 and 168 hours. Only the seven-day figure teaches; the earlier ones are shown but never learned from, because a post is not finished at day one.",
  },
  {
    icon: Scale,
    title: "It corrects for luck",
    description:
      "The raw number is measured against what your channel was already expected to do given its size, the day, the hour and the gap since your last post. What survives is the part you control.",
  },
  {
    icon: Send,
    title: "It tells you when it matters",
    description:
      "Beliefs update. If something crossed the line from hunch to finding, or a settled belief just got falsified, you hear about it. Otherwise it stays quiet.",
  },
];

function StepItem({
  step,
  isLast,
}: {
  step: (typeof steps)[0];
  isLast: boolean;
}): ReactNode {
  const Icon = step.icon;

  return (
    <div className={`relative flex gap-5 ${isLast ? "" : "pb-64"}`}>
      <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent" aria-hidden="true">
        <Icon className="h-5 w-5 text-black" strokeWidth={2} />
      </div>

      <div className="pt-1">
        <h3 className="text-xl font-semibold text-foreground sm:text-2xl">
          {step.title}
        </h3>
        <p className="mt-2 max-w-sm text-base leading-relaxed text-foreground/60">
          {step.description}
        </p>
      </div>
    </div>
  );
}

export function HowItWorks(): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 0.3", "end 0.7"],
  });

  const lineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section
      ref={containerRef}
      className="relative w-full bg-background"
    >
      <div className="mx-auto grid max-w-5xl gap-12 px-6 py-20 sm:py-28 lg:grid-cols-2 lg:gap-20">
        <div className="lg:sticky lg:top-48 lg:h-fit lg:self-start">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {howItWorksConfig.title}
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-foreground/60">
            {howItWorksConfig.description}
          </p>
          <motion.a
            href={howItWorksConfig.cta.href}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="mt-8 inline-flex items-center rounded-xl bg-foreground px-6 py-3 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
          >
            {howItWorksConfig.cta.text}
          </motion.a>
        </div>

        <div className="relative">
          <div className="absolute left-6 top-6 h-[calc(100%-6rem)] w-0.5 -translate-x-1/2 bg-foreground/10" aria-hidden="true">
            <motion.div
              style={{ height: lineHeight, willChange: "height" }}
              className="w-full bg-accent"
            />
          </div>

          <ol className="relative list-none p-0 m-0">
            {steps.map((step, index) => (
              <li key={step.title}>
                <StepItem
                  step={step}
                  isLast={index === steps.length - 1}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
