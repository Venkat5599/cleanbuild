'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import snapshot from '@/lib/snapshot.json';

/**
 * The proof section.
 *
 * This replaces the template's feature grid, which showed phone mockups, stock
 * avatars and invented uptime numbers. None of that is true of RATCHET, and a
 * page whose centrepiece is fabricated is worse than a page with no centrepiece.
 *
 * What is here instead is the real thing: the same credible-interval field the
 * product renders, drawn from an actual verified run. Every number comes from
 * the pipeline's own weekly snapshots via lib/snapshot.json (the same labelled
 * capture the dashboard falls back to) — after `scripts/verify-recovery.ts`
 * passed. The grey bars are what the agent believed early; the coloured bars
 * are what it believes now. The bars getting shorter is the entire claim of
 * the product, stated once, visually.
 */

interface TravelFeature {
  name: string;
  fromMean: number;
  fromSd: number;
  toMean: number;
  toSd: number;
}

const travel = snapshot.timeTravel as {
  fromWeek: number;
  toWeek: number;
  fromNObs: number;
  toNObs: number;
  features: TravelFeature[];
} | null;

interface Row {
  name: string;
  w1: { mean: number; sd: number };
  wN: { mean: number; sd: number };
}

/** Read from the labelled snapshot, not invented. See the file comment above. */
const ROWS: Row[] = travel
  ? [...travel.features]
      .sort((a, b) => Math.abs(b.toMean) - Math.abs(a.toMean))
      .slice(0, 6)
      .map((f) => ({
        name: f.name,
        w1: { mean: f.fromMean, sd: f.fromSd },
        wN: { mean: f.toMean, sd: f.toSd },
      }))
  : [];

const FROM_N = travel?.fromNObs ?? 0;
const TO_N = travel?.toNObs ?? 0;
const FROM_WEEK = travel?.fromWeek ?? 1;
const TO_WEEK = travel?.toWeek ?? 0;

const avg = (rows: Row[], pick: (r: Row) => number) =>
  rows.length === 0 ? 0 : rows.reduce((a, r) => a + pick(r), 0) / rows.length;
const AVG_SD_W1 = avg(ROWS, (r) => r.w1.sd);
const AVG_SD_WN = avg(ROWS, (r) => r.wN.sd);

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
              After {FROM_N} posts it knew almost nothing, and the bars said so. After {TO_N}
              the same bars are half as wide. Nothing was retrained. The evidence simply
              accumulated, and it does not reset when you close the tab.
            </p>

            <dl className="border-border mt-8 grid grid-cols-2 gap-6 border-t pt-6">
              <div>
                <dt className="text-muted-foreground font-mono text-xs">Uncertainty, week {FROM_WEEK}</dt>
                <dd className="text-foreground mt-1 font-mono text-2xl tabular-nums">±{AVG_SD_W1.toFixed(2)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground font-mono text-xs">Uncertainty, week {TO_WEEK}</dt>
                <dd className="text-accent mt-1 font-mono text-2xl tabular-nums">±{AVG_SD_WN.toFixed(2)}</dd>
              </div>
            </dl>
          </div>

          <motion.div
            initial={{ opacity: 1 }}
            className="overflow-x-auto"
            aria-label="Credible intervals for six creative features, compared between week {FROM_WEEK} and week {TO_WEEK}"
          >
            <p className="text-muted-foreground mb-3 font-mono text-xs">
              <span className="mr-5 inline-flex items-center gap-2">
                <span className="bg-border inline-block h-[3px] w-4" />{FROM_N} experiments
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="bg-accent inline-block h-[3px] w-4" />
                {TO_N} experiments
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
                const helps = r.wN.mean >= 0;
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

                    {/* Current week: the same features, half the uncertainty. */}
                    <line
                      x1={LABEL_W + x(r.wN.mean - 1.96 * r.wN.sd)}
                      x2={LABEL_W + x(r.wN.mean + 1.96 * r.wN.sd)}
                      y1={y + 5}
                      y2={y + 5}
                      stroke={helps ? 'var(--accent)' : 'var(--card-foreground-muted)'}
                      strokeOpacity={0.45}
                      strokeWidth={4}
                    />
                    <line
                      x1={LABEL_W + x(r.wN.mean)}
                      x2={LABEL_W + x(r.wN.mean)}
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
