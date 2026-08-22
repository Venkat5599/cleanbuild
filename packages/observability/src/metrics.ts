/**
 * Prometheus metrics.
 *
 * A Worker has no process that survives between invocations, so `prom-client`
 * in-memory counters would reset on every request and report nonsense. The
 * counters therefore live in Redis and `/metrics` renders the current values in
 * the Prometheus text exposition format.
 *
 * The endpoint is token-protected. An open /metrics leaks how a system behaves
 * and how often it fails, which is reconnaissance.
 */

import type { RedisClient } from './lock.js';

export type MetricType = 'counter' | 'gauge';

export interface MetricDef {
  name: string;
  type: MetricType;
  help: string;
}

/** Every metric this service exposes. Adding one here is the only way in. */
export const METRICS: MetricDef[] = [
  {
    name: 'ratchet_cron_runs_total',
    type: 'counter',
    help: 'Cron invocations that acquired the lock and ran.',
  },
  {
    name: 'ratchet_cron_skipped_total',
    type: 'counter',
    help: 'Cron invocations skipped because another invocation held the lock.',
  },
  {
    name: 'ratchet_cron_failures_total',
    type: 'counter',
    help: 'Cron invocations that threw.',
  },
  {
    name: 'ratchet_experiments_closed_total',
    type: 'counter',
    help: 'Experiments that reached 168h and contributed a reward to a posterior.',
  },
  {
    name: 'ratchet_experiments_voided_total',
    type: 'counter',
    help: 'Experiments voided for missing metrics. These teach nothing by design.',
  },
  {
    name: 'ratchet_notifications_sent_total',
    type: 'counter',
    help: 'Proactive messages delivered to a Mind or fallback channel.',
  },
  {
    name: 'ratchet_notifications_suppressed_total',
    type: 'counter',
    help: 'Belief changes judged immaterial or rate limited.',
  },
  {
    name: 'ratchet_notifications_undelivered_total',
    type: 'counter',
    help: 'Messages composed but not delivered. Surfaced, never discarded.',
  },
  {
    name: 'ratchet_posterior_drift',
    type: 'gauge',
    help: 'Max absolute divergence between the incremental and recomputed posterior means. Should sit near float epsilon.',
  },
  {
    name: 'ratchet_closed_experiments',
    type: 'gauge',
    help: 'Closed experiments in the ledger, the evidence the posterior rests on.',
  },
  {
    name: 'ratchet_followup_duration_ms',
    type: 'gauge',
    help: 'Duration of the last follow-up run.',
  },
];

const PREFIX = 'ratchet:metric:';

export class MetricsStore {
  constructor(private readonly redis: RedisClient | null) {}

  /** No-op when Redis is unconfigured, so metrics never break the job. */
  async increment(name: string, by = 1, labels: Record<string, string> = {}): Promise<void> {
    if (!this.redis) return;
    try {
      const key = PREFIX + seriesKey(name, labels);
      for (let i = 0; i < by; i++) await this.redis.incrementWindow(key, 60 * 60 * 24 * 30);
    } catch {
      // Metrics are never allowed to fail the thing they measure.
    }
  }

  async setGauge(name: string, value: number, labels: Record<string, string> = {}): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.setEx(PREFIX + seriesKey(name, labels), String(value), 60 * 60 * 24 * 30);
    } catch {
      // Same rule.
    }
  }

  private async read(name: string): Promise<number | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(PREFIX + name);
      if (raw === null) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  /**
   * Render the Prometheus text exposition format.
   *
   * Metrics with no stored value are emitted as 0 rather than omitted, so a
   * fresh deployment produces a complete, alertable series set instead of
   * gaps that look identical to an outage.
   */
  async render(): Promise<string> {
    const lines: string[] = [];
    for (const def of METRICS) {
      const value = (await this.read(def.name)) ?? 0;
      lines.push(`# HELP ${def.name} ${def.help}`);
      lines.push(`# TYPE ${def.name} ${def.type}`);
      lines.push(`${def.name} ${value}`);
    }
    return lines.join('\n') + '\n';
  }
}

function seriesKey(name: string, labels: Record<string, string>): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return name;
  return `${name}{${entries.map(([k, v]) => `${k}="${v}"`).join(',')}}`;
}

/**
 * Constant-time-ish bearer check for the metrics endpoint.
 * Compares full length regardless of where the first mismatch occurs, so the
 * comparison does not leak the token prefix through timing.
 */
export function authorizeMetrics(header: string | null, expected: string | undefined): boolean {
  if (!expected) return false;
  const provided = header?.replace(/^Bearer\s+/i, '') ?? '';
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
