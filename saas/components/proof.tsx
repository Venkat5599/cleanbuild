'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * The proof section.
 *
 * This replaces the template's feature grid, which showed phone mockups, stock
 * avatars and invented uptime numbers. None of that is true of RATCHET, and a
 * page whose centrepiece is fabricated is worse than a page with no centrepiece.
 *
 * What is here instead is the real thing: the same credible-interval field the
 * product renders, drawn from an actual verified run. Every number below was
 * read out of the database after `scripts/verify-recovery.ts` passed. The grey
 * bars are what the agent believed after five experiments; the coloured bars
 * are what it believed after a hundred and ninety-four. The bars getting
 * shorter is the entire claim of the product, stated once, visually.
 */

interface Row {
  name: string;
  w1: { mean: number; sd: number };
  w39: { mean: number; sd: number };
}

/** Read from the running system, not invented. See the file comment above. */
const ROWS: Row[] = [
  { name: 'hook_type:question', w1: { mean: 0.0, sd: 0.5 }, w39: { mean: 0.224, sd: 0.252 } },
  { name: 'topic_cluster:topic_3', w1: { mean: 0.0, sd: 0.5 }, w39: { mean: 0.189, sd: 0.248 } },
  {
    name: 'hook_type:story_cold_open',
    w1: { mean: 0.186, sd: 0.47 },
    w39: { mean: 0.185, sd: 0.245 },
  },
  { name: 'hook_type:claim', w1: { mean: 0.101, sd: 0.473 }, w39: { mean: -0.252, sd: 0.243 } },
  { name: 'topic_cluster:topic_6', w1: { mean: 0.0, sd: 0.5 }, w39: { mean: -0.251, sd: 0.261 } },
  {
    name: 'thumbnail_archetype:object_hero',
    w1: { mean: 0.0, sd: 0.5 },
    w39: { mean: -0.298, sd: 0.254 },
  },
];

const DOMAIN = 1.2;
const PLOT_W = 420;
const ROW_H = 34;
const LABEL_W = 220;

export function Proof(): ReactNode {
  const height = ROWS.length * ROW_H + 24;
  const x = (v: number) =>
    ((Math.max(-DOMAIN, Math.min(DOMAIN, v)) + DOMAIN) / (2 * DOMAIN)) * PLOT_W;

  return (
    <section className="border-border border-t px-6 py-24 md:py-32" aria-labelledby="proof-title">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-16">
          <div className="max-w-[46ch]">
            <h2
              id="proof-title"
              className="text-foreground text-3xl leading-tight font-medium tracking-tight md:text-4xl"
            >
              The memory is a model, not a transcript
            </h2>
            <p className="text-muted-foreground mt-5 leading-relaxed">
              Most assistants remember what you said. This one remembers what worked. Every closed
              experiment narrows what it believes, and you can watch the uncertainty come down.
            </p>
            <p className="text-muted-foreground mt-4 leading-relaxed">
              After five posts it knew almost nothing, and the bars said so. After a hundred and
              ninety-four the same bars are half as wide. Nothing was retrained. The evidence simply
              accumulated, and it does not reset when you close the tab.
            </p>

            <dl className="border-border mt-8 grid grid-cols-2 gap-6 border-t pt-6">
              <div>
                <dt className="text-muted-foreground font-mono text-xs">Uncertainty, week 1</dt>
                <dd className="text-foreground mt-1 font-mono text-2xl tabular-nums">±0.98</dd>
              </div>
              <div>
                <dt className="text-muted-foreground font-mono text-xs">Uncertainty, week 39</dt>
                <dd className="text-accent mt-1 font-mono text-2xl tabular-nums">±0.49</dd>
              </div>
            </dl>
          </div>

          <motion.div
            initial={{ opacity: 1 }}
            className="overflow-x-auto"
            aria-label="Credible intervals for six creative features, compared between week one and week thirty-nine"
          >
            <p className="text-muted-foreground mb-3 font-mono text-xs">
              <span className="mr-5 inline-flex items-center gap-2">
                <span className="bg-border inline-block h-[3px] w-4" />5 experiments
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="bg-accent inline-block h-[3px] w-4" />
                194 experiments
              </span>
            </p>

            <svg
              width={LABEL_W + PLOT_W}
              height={height}
              className="block"
              style={{ minWidth: LABEL_W + PLOT_W }}
            >
              <line
                x1={LABEL_W + x(0)}
                x2={LABEL_W + x(0)}
                y1={2}
                y2={height - 16}
                stroke="var(--border)"
              />
              <text
                x={LABEL_W + x(0)}
                y={height - 3}
                fill="var(--muted-foreground)"
                fontSize={10}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
              >
                no effect
              </text>

              {ROWS.map((r, i) => {
                const y = i * ROW_H + 16;
                const helps = r.w39.mean >= 0;
                return (
                  <g key={r.name}>
                    <text
                      x={0}
                      y={y + 4}
                      fill="var(--muted-foreground)"
                      fontSize={11}
                      fontFamily="var(--font-mono)"
                    >
                      {r.name}
                    </text>

                    {/* Week 1: what it believed with almost no evidence. */}
                    <line
                      x1={LABEL_W + x(r.w1.mean - 1.96 * r.w1.sd)}
                      x2={LABEL_W + x(r.w1.mean + 1.96 * r.w1.sd)}
                      y1={y - 5}
                      y2={y - 5}
                      stroke="var(--border)"
                      strokeWidth={4}
                    />

                    {/* Week 39: the same features, half the uncertainty. */}
                    <line
                      x1={LABEL_W + x(r.w39.mean - 1.96 * r.w39.sd)}
                      x2={LABEL_W + x(r.w39.mean + 1.96 * r.w39.sd)}
                      y1={y + 5}
                      y2={y + 5}
                      stroke={helps ? 'var(--accent)' : 'var(--card-foreground-muted)'}
                      strokeOpacity={0.45}
                      strokeWidth={4}
                    />
                    <line
                      x1={LABEL_W + x(r.w39.mean)}
                      x2={LABEL_W + x(r.w39.mean)}
                      y1={y}
                      y2={y + 10}
                      stroke={helps ? 'var(--accent)' : 'var(--card-foreground-muted)'}
                      strokeWidth={2}
                    />
                  </g>
                );
              })}
            </svg>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
