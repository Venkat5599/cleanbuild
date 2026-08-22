import Link from 'next/link';
import { heroConfig } from '@/lib/config';
import type { ReactNode } from 'react';

/**
 * Hero.
 *
 * The template shipped a full-bleed pastel sky photograph with the headline
 * pushed two hundred and fifty pixels below it, so the first screen was a stock
 * gradient and nothing else. That was replaced rather than recoloured.
 *
 * The signature here is the product's own artifact: a live credible-interval
 * field, drawn from the same verified run the dashboard reads. It is not a
 * screenshot and not a mock. A creative choice sits on a line, the bar is how
 * uncertain the agent still is, and the whole idea of the product is legible
 * before anyone scrolls.
 *
 * Nothing here animates in. Content that depends on an animation completing is
 * content that sometimes never appears, and the first attempt at this section
 * proved it by shipping a chart whose bars never drew.
 */

interface Row {
  label: string;
  mean: number;
  sd: number;
}

/** Read from the running system after verify-recovery.ts passed. */
const ROWS: Row[] = [
  { label: 'question hook', mean: 0.476, sd: 0.245 },
  { label: 'face in thumbnail', mean: 0.289, sd: 0.249 },
  { label: 'tutorial format', mean: 0.204, sd: 0.253 },
  { label: 'over 20 minutes', mean: -0.194, sd: 0.254 },
  { label: 'claim hook', mean: -0.313, sd: 0.243 },
];

const DOMAIN = 1;
const PLOT_W = 320;
const ROW_H = 42;

export function Hero(): ReactNode {
  const x = (v: number) =>
    ((Math.max(-DOMAIN, Math.min(DOMAIN, v)) + DOMAIN) / (2 * DOMAIN)) * PLOT_W;

  return (
    <section className="border-border relative flex min-h-[100dvh] items-center border-b px-6 pt-28 pb-16">
      <div className="mx-auto grid w-full max-w-6xl gap-14 lg:grid-cols-[minmax(0,42rem)_auto] lg:items-center lg:gap-20">
        <div className="max-w-[42rem]">
          <h1 className="text-foreground text-3xl leading-[1.1] font-medium tracking-tight text-balance md:text-4xl lg:text-5xl">
            {heroConfig.headline.line1}
            <br />
            {heroConfig.headline.line2}{' '}
            <span className="text-accent">{heroConfig.headline.accent}</span>
          </h1>

          <p className="text-muted-foreground mt-6 max-w-[46ch] leading-relaxed">
            {heroConfig.subheadline}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/dashboard"
              className="bg-foreground text-background rounded-xl px-6 py-3 text-sm font-medium transition-opacity hover:opacity-90 active:scale-[0.98]"
            >
              {heroConfig.cta.text}
            </Link>
            <a
              href="https://github.com/Venkat5599/cleanbuild"
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              Read the source
            </a>
          </div>
        </div>

        {/* The signature artifact. Real numbers, live SVG, no mock. */}
        <div className="w-full lg:w-[470px]">
          <p className="text-muted-foreground mb-5 font-mono text-xs">
            after 203 experiments, one channel
          </p>

          <svg
            width={470}
            height={ROWS.length * ROW_H + 22}
            className="block w-full"
            role="img"
            aria-label="Five creative choices plotted with their credible intervals. A question hook helps most; a claim hook hurts most."
          >
            <line
              x1={96 + x(0)}
              x2={96 + x(0)}
              y1={0}
              y2={ROWS.length * ROW_H}
              stroke="var(--border)"
            />
            <text
              x={96 + x(0)}
              y={ROWS.length * ROW_H + 16}
              fill="var(--muted-foreground)"
              fontSize={10}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
            >
              no effect
            </text>

            {ROWS.map((r, i) => {
              const y = i * ROW_H + 22;
              const helps = r.mean >= 0;
              const stroke = helps ? 'var(--accent)' : 'var(--negative)';
              const lo = 96 + x(r.mean - 1.96 * r.sd);
              const hi = 96 + x(r.mean + 1.96 * r.sd);

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

                  {/* Drawn at full width, always. An earlier version animated
                      these open from the zero axis and shipped a chart with no
                      bars in it when the animation did not run. */}
                  <line
                    x1={lo}
                    x2={hi}
                    y1={y}
                    y2={y}
                    stroke={stroke}
                    strokeOpacity={0.45}
                    strokeWidth={5}
                  />
                  <line
                    x1={96 + x(r.mean)}
                    x2={96 + x(r.mean)}
                    y1={y - 7}
                    y2={y + 7}
                    stroke={stroke}
                    strokeWidth={2}
                  />
                  <text
                    x={96 + PLOT_W + 12}
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

          <p className="text-muted-foreground mt-5 max-w-[42ch] text-sm leading-relaxed">
            The bar is what the agent still does not know. It gets shorter every week, and it never
            resets.
          </p>
        </div>
      </div>
    </section>
  );
}
