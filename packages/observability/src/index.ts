/**
 * Observability.
 *
 * A cron job that nobody watches is a cron job that silently stops. The
 * autonomous loop is the product, so it needs to be legible after the fact:
 * what ran, how long it took, what it decided, and what it failed to do.
 *
 * Three sinks, all optional and all non-fatal:
 *   console                 always on, structured JSON lines
 *   Analytics Engine        Cloudflare's built-in time series, if bound
 *   webhook                 anything that accepts JSON, if configured
 *
 * Nothing here may throw into the caller. A telemetry failure must never take
 * down the job it is measuring.
 */

export type Severity = 'debug' | 'info' | 'warn' | 'error';

export interface EventFields {
  [key: string]: string | number | boolean | null | undefined;
}

export interface AnalyticsEngineDataset {
  writeDataPoint(event: {
    blobs?: string[];
    doubles?: number[];
    indexes?: string[];
  }): void;
}

export interface ObservabilityOptions {
  service: string;
  environment?: string;
  analytics?: AnalyticsEngineDataset | null;
  webhookUrl?: string | null;
  /** Redacted before any sink sees them. */
  redactKeys?: string[];
  now?: () => number;
}

const DEFAULT_REDACT = [
  'apiKey',
  'api_key',
  'token',
  'botToken',
  'authorization',
  'password',
  'secret',
  'databaseUrl',
  'DATABASE_URL',
];

export class Observability {
  private readonly opts: Required<Omit<ObservabilityOptions, 'analytics' | 'webhookUrl'>> & {
    analytics: AnalyticsEngineDataset | null;
    webhookUrl: string | null;
  };

  constructor(options: ObservabilityOptions) {
    this.opts = {
      service: options.service,
      environment: options.environment ?? 'development',
      analytics: options.analytics ?? null,
      webhookUrl: options.webhookUrl ?? null,
      redactKeys: [...DEFAULT_REDACT, ...(options.redactKeys ?? [])],
      now: options.now ?? Date.now,
    };
  }

  event(name: string, fields: EventFields = {}, severity: Severity = 'info'): void {
    const safe = this.redact(fields);
    const line = {
      event: name,
      severity,
      service: this.opts.service,
      env: this.opts.environment,
      at: new Date(this.opts.now()).toISOString(),
      ...safe,
    };

    // Console first, always. If the other sinks fail this line still exists.
    const out = JSON.stringify(line);
    if (severity === 'error') console.error(out);
    else if (severity === 'warn') console.warn(out);
    else console.log(out);

    try {
      this.opts.analytics?.writeDataPoint({
        indexes: [name],
        blobs: [this.opts.service, this.opts.environment, severity, JSON.stringify(safe)].slice(
          0,
          20,
        ),
        doubles: numericValues(safe),
      });
    } catch {
      // A telemetry failure must not surface as a job failure.
    }
  }

  error(name: string, err: unknown, fields: EventFields = {}): void {
    this.event(
      name,
      {
        ...fields,
        errorType: err instanceof Error ? err.name : typeof err,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
      'error',
    );
  }

  /**
   * Time an operation and emit one event with its duration and outcome.
   * Rethrows, so behaviour is unchanged whether or not it is instrumented.
   */
  async span<T>(name: string, fn: () => Promise<T>, fields: EventFields = {}): Promise<T> {
    const start = this.opts.now();
    try {
      const result = await fn();
      this.event(`${name}.ok`, { ...fields, durationMs: this.opts.now() - start });
      return result;
    } catch (e) {
      this.error(`${name}.failed`, e, { ...fields, durationMs: this.opts.now() - start });
      throw e;
    }
  }

  /** Fire-and-forget webhook. Caller passes it to ctx.waitUntil if it cares. */
  async flushWebhook(name: string, payload: unknown): Promise<void> {
    if (!this.opts.webhookUrl) return;
    try {
      await fetch(this.opts.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: this.opts.service, event: name, payload }),
      });
    } catch {
      // Same rule: never propagate.
    }
  }

  private redact(fields: EventFields): EventFields {
    const out: EventFields = {};
    for (const [k, v] of Object.entries(fields)) {
      const sensitive = this.opts.redactKeys.some((r) =>
        k.toLowerCase().includes(r.toLowerCase()),
      );
      out[k] = sensitive ? '[redacted]' : v;
    }
    return out;
  }
}

function numericValues(fields: EventFields): number[] {
  return Object.values(fields).filter((v): v is number => typeof v === 'number');
}

/** No-op instance for tests and local scripts. */
export const nullObservability = new Observability({ service: 'test', environment: 'test' });

export * from './lock.js';

export * from './otel.js';

export * from './metrics.js';
