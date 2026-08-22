/**
 * The interval field. The signature artifact of the product.
 *
 * Every creative feature is drawn as a horizontal credible interval on a
 * shared zero axis. The bar is the 95% interval; the tick is the mean. When an
 * earlier posterior is supplied it renders above as a ghost, so the change
 * between two points in time is one visual fact rather than two charts the
 * reader has to hold in their head.
 *
 * A point estimate of a creative effect measured over a couple of hundred
 * posts is a lie of precision. The width of the bar is the honest content, and
 * it is also the memory proof: the bars visibly contract as evidence arrives.
 *
 * Plain SVG with no entrance animation, so every value is on screen whether or
 * not scripting or motion ever runs.
 */

import type { ReactNode } from 'react';

export interface IntervalDatum {
  name: string;
  mean: number;
  ciLow: number;
  ciHigh: number;
  probPositive: number;
  ghost?: { mean: number; ciLow: number; ciHigh: number };
}

interface Props {
  data: IntervalDatum[];
  domain?: number;
  ghostLabel?: string;
  liveLabel?: string;
}

const ROW_H = 30;
const LABEL_W = 208;
const VALUE_W = 118;
const PLOT_W = 440;

export function IntervalField({ data, domain = 1, ghostLabel, liveLabel }: Props): ReactNode {
  if (data.length === 0) {
    return (
      <div className="border-border text-muted-foreground border-l-2 py-3 pl-4">
        <p className="text-foreground font-medium">No beliefs yet.</p>
        <p className="mt-1 max-w-[52ch] text-sm">
          The posterior appears once experiments have closed. Nothing is drawn before there is
          evidence, because an empty model rendered as a chart looks identical to a confident one.
        </p>
      </div>
    );
  }

  const height = data.length * ROW_H + 26;
  const totalW = LABEL_W + PLOT_W + VALUE_W;
  const x = (v: number) =>
    ((Math.max(-domain, Math.min(domain, v)) + domain) / (2 * domain)) * PLOT_W;
  const zero = x(0);

  return (
    <div className="overflow-x-auto">
      {(ghostLabel || liveLabel) && (
        <p className="text-muted-foreground mb-3 font-mono text-xs">
          {ghostLabel && (
            <span className="mr-6 inline-flex items-center gap-2">
              <span className="bg-border inline-block h-[3px] w-4" />
              {ghostLabel}
            </span>
          )}
          {liveLabel && (
            <span className="inline-flex items-center gap-2">
              <span className="bg-accent inline-block h-[3px] w-4" />
              {liveLabel}
            </span>
          )}
        </p>
      )}

      <svg
        width={totalW}
        height={height}
        role="img"
        aria-label={`Credible intervals for ${data.length} creative features`}
        className="block"
        style={{ minWidth: totalW }}
      >
        {/* The only rule on the plot, because it is the only one that means
            anything: left of it a feature hurts, right of it helps. */}
        <line
          x1={LABEL_W + zero}
          x2={LABEL_W + zero}
          y1={4}
          y2={height - 18}
          stroke="var(--border)"
        />
        <text
          x={LABEL_W + zero}
          y={height - 4}
          fill="var(--muted-foreground)"
          fontSize={10}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
        >
          0
        </text>
        <text
          x={LABEL_W}
          y={height - 4}
          fill="var(--muted-foreground)"
          fontSize={10}
          fontFamily="var(--font-mono)"
        >
          -{domain}
        </text>
        <text
          x={LABEL_W + PLOT_W}
          y={height - 4}
          fill="var(--muted-foreground)"
          fontSize={10}
          textAnchor="end"
          fontFamily="var(--font-mono)"
        >
          +{domain}
        </text>

        {data.map((d, i) => {
          const y = i * ROW_H + 15;
          const helps = d.mean >= 0;
          const stroke = helps ? 'var(--accent)' : 'var(--negative)';
          // Confidence drives opacity, so an uncertain feature reads as fainter
          // rather than being dressed up as a finding.
          const confidence = Math.abs(d.probPositive - 0.5) * 2;
          const opacity = 0.4 + confidence * 0.6;

          return (
            <g key={d.name}>
              <text
                x={0}
                y={y + 4}
                fill="var(--muted-foreground)"
                fontSize={11.5}
                fontFamily="var(--font-mono)"
              >
                {d.name}
              </text>

              {d.ghost && (
                <line
                  x1={LABEL_W + x(d.ghost.ciLow)}
                  x2={LABEL_W + x(d.ghost.ciHigh)}
                  y1={y - 6}
                  y2={y - 6}
                  stroke="var(--border)"
                  strokeWidth={4}
                />
              )}

              <line
                x1={LABEL_W + x(d.ciLow)}
                x2={LABEL_W + x(d.ciHigh)}
                y1={y + (d.ghost ? 4 : 0)}
                y2={y + (d.ghost ? 4 : 0)}
                stroke={stroke}
                strokeOpacity={opacity * 0.45}
                strokeWidth={5}
              />
              <line
                x1={LABEL_W + x(d.mean)}
                x2={LABEL_W + x(d.mean)}
                y1={y + (d.ghost ? -1 : -6)}
                y2={y + (d.ghost ? 9 : 6)}
                stroke={stroke}
                strokeOpacity={opacity}
                strokeWidth={2}
              />

              <text
                x={LABEL_W + PLOT_W + 12}
                y={y + 4}
                fill="var(--foreground)"
                fontSize={11}
                fontFamily="var(--font-mono)"
              >
                {d.mean >= 0 ? '+' : ''}
                {d.mean.toFixed(2)}
              </text>
              <text
                x={LABEL_W + PLOT_W + 68}
                y={y + 4}
                fill="var(--muted-foreground)"
                fontSize={11}
                fontFamily="var(--font-mono)"
              >
                {(d.probPositive * 100).toFixed(0)}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
