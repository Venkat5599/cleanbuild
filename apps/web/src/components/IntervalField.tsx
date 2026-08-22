/**
 * The interval field. This is the signature of the product.
 *
 * Every creative feature is drawn as a horizontal credible interval on a shared
 * zero axis. The bar is the 95% interval; the tick is the posterior mean. When
 * a second posterior is supplied it renders behind as a ghost, so movement
 * between two points in time is a single visual fact rather than two charts the
 * reader has to hold in their head.
 *
 * Why this and not a bar chart of point estimates: a point estimate of a
 * creative effect measured over forty posts is a lie of precision. The width of
 * the bar IS the honest content. It is also the memory proof, because the bars
 * visibly contract as evidence accumulates.
 *
 * Inline SVG, no animation gating visibility: if scripting or motion never
 * runs, every value is still on screen.
 */

export interface IntervalDatum {
  name: string;
  mean: number;
  ciLow: number;
  ciHigh: number;
  probPositive: number;
  /** Optional earlier posterior, drawn as a ghost behind. */
  ghost?: { mean: number; ciLow: number; ciHigh: number };
}

interface Props {
  data: IntervalDatum[];
  /** Axis half-width in effect units. Bars are clamped to it. */
  domain?: number;
  ghostLabel?: string;
  liveLabel?: string;
}

const ROW_H = 26;
const LABEL_W = 210;
const VALUE_W = 132;
const PLOT_W = 460;

export function IntervalField({ data, domain = 1, ghostLabel, liveLabel }: Props) {
  if (data.length === 0) {
    return (
      <div className="state">
        <strong>No beliefs yet.</strong>
        <p className="dim">
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
    <div className="scroll-x">
      {(ghostLabel || liveLabel) && (
        <p className="meta legend">
          {ghostLabel && (
            <span className="legend__item">
              <span className="legend__swatch legend__swatch--ghost" />
              {ghostLabel}
            </span>
          )}
          {liveLabel && (
            <span className="legend__item">
              <span className="legend__swatch legend__swatch--live" />
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
        className="field"
      >
        {/* Zero axis. The only rule on the plot, because it is the only one
            that means anything: left of it a feature hurts, right of it helps. */}
        <line
          x1={LABEL_W + zero}
          x2={LABEL_W + zero}
          y1={4}
          y2={height - 18}
          stroke="var(--rule-strong)"
          strokeWidth={1}
        />
        <text
          x={LABEL_W + zero}
          y={height - 5}
          fill="var(--text-faint)"
          fontSize={10}
          textAnchor="middle"
          fontFamily="var(--mono)"
        >
          0
        </text>
        <text
          x={LABEL_W}
          y={height - 5}
          fill="var(--text-faint)"
          fontSize={10}
          fontFamily="var(--mono)"
        >
          -{domain}
        </text>
        <text
          x={LABEL_W + PLOT_W}
          y={height - 5}
          fill="var(--text-faint)"
          fontSize={10}
          textAnchor="end"
          fontFamily="var(--mono)"
        >
          +{domain}
        </text>

        {data.map((d, i) => {
          const y = i * ROW_H + 14;
          const colour = d.mean >= 0 ? 'var(--pos)' : 'var(--neg)';
          // Confidence drives opacity, so an uncertain feature literally reads
          // as fainter rather than being dressed up as a finding.
          const confidence = Math.abs(d.probPositive - 0.5) * 2;
          const opacity = 0.42 + confidence * 0.58;

          return (
            <g key={d.name}>
              <text
                x={0}
                y={y + 4}
                fill="var(--text-dim)"
                fontSize={11.5}
                fontFamily="var(--mono)"
              >
                {d.name}
              </text>

              {d.ghost && (
                <>
                  <line
                    x1={LABEL_W + x(d.ghost.ciLow)}
                    x2={LABEL_W + x(d.ghost.ciHigh)}
                    y1={y}
                    y2={y}
                    stroke="var(--rule-strong)"
                    strokeWidth={5}
                  />
                  <line
                    x1={LABEL_W + x(d.ghost.mean)}
                    x2={LABEL_W + x(d.ghost.mean)}
                    y1={y - 5}
                    y2={y + 5}
                    stroke="var(--text-faint)"
                    strokeWidth={1}
                  />
                </>
              )}

              <line
                x1={LABEL_W + x(d.ciLow)}
                x2={LABEL_W + x(d.ciHigh)}
                y1={y}
                y2={y}
                stroke={colour}
                strokeOpacity={opacity * 0.5}
                strokeWidth={5}
              />
              <line
                x1={LABEL_W + x(d.mean)}
                x2={LABEL_W + x(d.mean)}
                y1={y - 6}
                y2={y + 6}
                stroke={colour}
                strokeOpacity={opacity}
                strokeWidth={2}
              />

              <text
                x={LABEL_W + PLOT_W + 10}
                y={y + 4}
                fill="var(--text-dim)"
                fontSize={11}
                fontFamily="var(--mono)"
              >
                {d.mean >= 0 ? '+' : ''}
                {d.mean.toFixed(2)}
              </text>
              <text
                x={LABEL_W + PLOT_W + 66}
                y={y + 4}
                fill="var(--text-faint)"
                fontSize={11}
                fontFamily="var(--mono)"
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
