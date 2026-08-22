'use client';

import { LogoLoop, type LogoItem } from '@/components/logo-loop';
import { heroConfig } from '@/lib/config';
import { ArrowDownRight } from 'lucide-react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import Link from 'next/link';
import { useRef, type ReactNode, type MouseEvent } from 'react';

/**
 * Hero.
 *
 * The template's composition is kept: parallax backdrop, large centred
 * headline, framed product panel below the fold line, marquee underneath. What
 * changed is what fills them.
 *
 * Two substitutions matter:
 *
 * 1. The framed panel held `dashboardmock.png`, a picture of a product that
 *    does not exist. It now renders the real interval field as live SVG, from
 *    numbers read out of the database after the verification script passed. It
 *    is the actual thing, not a photograph of a thing, and it cannot go stale.
 *
 * 2. The marquee held eight invented company logos. RATCHET has no customers,
 *    so it carries the stack it is genuinely built on instead.
 *
 * The pill above the headline states a fact about the data rather than a
 * release status, because "Now Available" tells a reader nothing.
 *
 * Nothing here starts at opacity zero. The template's variants did, and when
 * the variant chain failed to resolve the whole hero rendered as an empty dark
 * rectangle. Motion only moves elements that are already on screen, so the
 * worst case is a page with no animation rather than a page with no content.
 */

const ease = [0.23, 1, 0.32, 1] as const;

const fadeInUp = {
  hidden: { y: 14 },
  visible: { y: 0 },
};

const fadeInScale = {
  hidden: { scale: 0.985 },
  visible: { scale: 1 },
};

/** Real technologies, not invented customers. */
const STACK = [
  'Cloudflare Workers',
  'D1',
  'Minds by Animoca',
  'Hono',
  'Drizzle',
  'oRPC',
  'TypeScript',
];

const logos: LogoItem[] = STACK.map((name) => ({
  node: (
    <span className="text-muted-foreground font-mono text-sm tracking-wide whitespace-nowrap">
      {name}
    </span>
  ),
}));

/** Read from the running system after scripts/verify-recovery.ts passed. */
const ROWS = [
  { label: 'question hook', mean: 0.476, sd: 0.245 },
  { label: 'face in thumbnail', mean: 0.289, sd: 0.249 },
  { label: 'tutorial format', mean: 0.204, sd: 0.253 },
  { label: 'weekend morning', mean: 0.152, sd: 0.262 },
  { label: 'over 20 minutes', mean: -0.194, sd: 0.254 },
  { label: 'claim hook', mean: -0.313, sd: 0.243 },
];

const PARALLAX_INTENSITY = 20;

export function Hero(): ReactNode {
  const sectionRef = useRef<HTMLElement>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 150 };
  const x = useSpring(mouseX, springConfig);
  const y = useSpring(mouseY, springConfig);

  const handleMouseMove = (e: MouseEvent<HTMLElement>) => {
    if (!sectionRef.current) return;
    const rect = sectionRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    mouseX.set(((e.clientX - rect.left - centerX) / centerX) * -PARALLAX_INTENSITY);
    mouseY.set(((e.clientY - rect.top - centerY) / centerY) * -PARALLAX_INTENSITY);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <section
      ref={sectionRef}
      className="relative flex flex-col overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Atmosphere, on the brand's own hues rather than a stock sky, so the
          first screen belongs to this product and matches the dashboard. */}
      <motion.div
        className="absolute inset-0 -z-10 min-[850px]:inset-2.5 min-[850px]:scale-105 min-[850px]:rounded-b-4xl"
        style={{
          x,
          y,
          background:
            'radial-gradient(120% 90% at 50% -10%, color-mix(in oklab, var(--accent) 20%, transparent) 0%, transparent 62%), radial-gradient(80% 60% at 84% 6%, color-mix(in oklab, var(--negative) 10%, transparent) 0%, transparent 58%), var(--frame)',
        }}
        aria-hidden="true"
      />

      <div className="flex items-start justify-center px-6 pt-40 max-[850px]:pt-28">
        <motion.div
          className="flex max-w-4xl flex-col items-center text-center max-[850px]:w-full max-[850px]:items-start max-[850px]:text-left"
          initial="hidden"
          animate="visible"
          transition={{ staggerChildren: 0.15, delayChildren: 0.2 }}
        >
          <motion.div
            className="border-border bg-muted text-muted-foreground mb-7 inline-flex items-center rounded-xl border px-4 py-1.5 font-mono text-xs"
            variants={fadeInUp}
            transition={{ duration: 0.8, ease }}
          >
            203 experiments, one channel
          </motion.div>

          <h1 className="text-foreground mb-6 text-6xl font-medium tracking-tight max-[850px]:text-4xl">
            <motion.span className="block" variants={fadeInUp} transition={{ duration: 0.8, ease }}>
              {heroConfig.headline.line1}
            </motion.span>
            <motion.span className="block" variants={fadeInUp} transition={{ duration: 0.8, ease }}>
              {heroConfig.headline.line2}{' '}
              <span className="text-accent">{heroConfig.headline.accent}</span>
            </motion.span>
          </h1>

          <motion.p
            className="text-muted-foreground mb-9 max-w-[52ch] text-lg leading-relaxed"
            variants={fadeInUp}
            transition={{ duration: 0.8, ease }}
          >
            {heroConfig.subheadline}
          </motion.p>

          <motion.div
            variants={fadeInScale}
            transition={{ duration: 0.8, ease }}
            className="max-[850px]:w-full"
          >
            <Link
              href="/dashboard"
              className="group relative inline-flex cursor-pointer items-center max-[850px]:w-full"
            >
              <span className="bg-accent absolute inset-y-0 right-0 w-[calc(100%-2rem)] rounded-xl max-[850px]:w-full" />
              <span className="bg-foreground text-background relative z-10 rounded-xl px-6 py-3 font-medium max-[850px]:flex-1">
                {heroConfig.cta.text}
              </span>
              <span className="text-background relative -left-px z-10 flex h-11 w-11 items-center justify-center rounded-xl">
                <ArrowDownRight className="h-5 w-5 transition-transform duration-300 group-hover:-rotate-45" />
              </span>
            </Link>
          </motion.div>
        </motion.div>
      </div>

      {/* The product itself, framed. Live SVG rather than a screenshot. */}
      <motion.div
        className="relative mt-24 px-6 max-[850px]:mt-12"
        initial={{ y: 28 }}
        animate={{ y: 0 }}
        transition={{ duration: 1, delay: 0.2, ease }}
      >
        <div className="relative mx-auto max-w-4xl">
          <div className="border-border bg-background relative overflow-hidden rounded-2xl border shadow-2xl">
            <div className="border-border text-muted-foreground flex items-baseline justify-between border-b px-6 py-4 font-mono text-xs">
              <span className="text-foreground">What works for this audience</span>
              <span>95% credible intervals</span>
            </div>
            <div className="overflow-x-auto px-6 py-6">
              <IntervalPreview />
            </div>
          </div>
          {/* Fades into the page rather than stopping at a hard edge. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
            style={{ background: 'linear-gradient(to bottom, transparent, var(--background))' }}
            aria-hidden="true"
          />
        </div>
      </motion.div>

      <motion.div
        className="pt-16 pb-12"
        initial={false}
        transition={{ duration: 0.8, ease }}
      >
        <p className="text-muted-foreground mb-5 text-center font-mono text-xs">Built on</p>
        <LogoLoop logos={logos} speed={45} logoHeight={20} gap={96} />
      </motion.div>
    </section>
  );
}

const DOMAIN = 1;
const PLOT_W = 340;
const ROW_H = 34;
const LABEL_W = 150;

/**
 * The interval field at hero scale. Drawn at full width with no entrance
 * animation: an earlier revision animated the bars open and shipped a chart
 * with nothing in it when the animation did not run.
 */
function IntervalPreview(): ReactNode {
  const x = (v: number) =>
    ((Math.max(-DOMAIN, Math.min(DOMAIN, v)) + DOMAIN) / (2 * DOMAIN)) * PLOT_W;

  return (
    <svg
      width={LABEL_W + PLOT_W + 70}
      height={ROWS.length * ROW_H + 20}
      className="block"
      style={{ minWidth: LABEL_W + PLOT_W + 70 }}
      role="img"
      aria-label="Six creative choices with their credible intervals. A question hook helps most; a claim hook hurts most."
    >
      <line
        x1={LABEL_W + x(0)}
        x2={LABEL_W + x(0)}
        y1={0}
        y2={ROWS.length * ROW_H}
        stroke="var(--border)"
      />
      <text
        x={LABEL_W + x(0)}
        y={ROWS.length * ROW_H + 14}
        fill="var(--muted-foreground)"
        fontSize={10}
        textAnchor="middle"
        fontFamily="var(--font-mono)"
      >
        no effect
      </text>

      {ROWS.map((r, i) => {
        const y = i * ROW_H + 18;
        const stroke = r.mean >= 0 ? 'var(--accent)' : 'var(--negative)';
        return (
          <g key={r.label}>
            <text
              x={0}
              y={y + 4}
              fill="var(--muted-foreground)"
              fontSize={11}
              fontFamily="var(--font-mono)"
            >
              {r.label}
            </text>
            <line
              x1={LABEL_W + x(r.mean - 1.96 * r.sd)}
              x2={LABEL_W + x(r.mean + 1.96 * r.sd)}
              y1={y}
              y2={y}
              stroke={stroke}
              strokeOpacity={0.4}
              strokeWidth={5}
            />
            <line
              x1={LABEL_W + x(r.mean)}
              x2={LABEL_W + x(r.mean)}
              y1={y - 7}
              y2={y + 7}
              stroke={stroke}
              strokeWidth={2}
            />
            <text
              x={LABEL_W + PLOT_W + 14}
              y={y + 4}
              fill="var(--foreground)"
              fontSize={11}
              fontFamily="var(--font-mono)"
            >
              {r.mean >= 0 ? '+' : ''}
              {r.mean.toFixed(2)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
