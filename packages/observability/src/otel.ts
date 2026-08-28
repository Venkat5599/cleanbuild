/**
 * OpenTelemetry tracing over OTLP/HTTP.
 *
 * The Node OTel SDK (`@opentelemetry/sdk-node`) cannot run in a Cloudflare
 * Worker: it depends on async_hooks and a long-lived process, and Workers have
 * neither. Rather than pretend otherwise, this emits the OTLP/HTTP JSON
 * protocol directly with fetch. Any OTLP collector accepts it, so Jaeger,
 * Tempo, Honeycomb, Grafana Cloud and the OTel Collector all work unchanged.
 *
 * Spans are buffered per invocation and flushed once, because a Worker gets a
 * limited number of subrequests and one flush per run is the honest budget.
 */

const OTEL_STATUS_UNSET = 0;
const OTEL_STATUS_OK = 1;
const OTEL_STATUS_ERROR = 2;

export type AttributeValue = string | number | boolean;

export interface SpanOptions {
  attributes?: Record<string, AttributeValue>;
  /** SpanKind: 1 internal, 2 server, 3 client, 4 producer, 5 consumer. */
  kind?: 1 | 2 | 3 | 4 | 5;
}

interface FinishedSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Array<{ key: string; value: { stringValue?: string; doubleValue?: number; boolValue?: boolean } }>;
  status: { code: number; message?: string };
}

export interface OtelOptions {
  /** Collector endpoint, e.g. https://otlp.example.com/v1/traces */
  endpoint: string;
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  /** Extra headers, typically an auth token for a hosted collector. */
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  /** Fraction of traces to keep, 0..1. Default 1 (cron volume is tiny). */
  sampleRatio?: number;
}

function hex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function toAttributes(
  attrs: Record<string, AttributeValue>,
): FinishedSpan['attributes'] {
  return Object.entries(attrs).map(([key, value]) => {
    if (typeof value === 'number') return { key, value: { doubleValue: value } };
    if (typeof value === 'boolean') return { key, value: { boolValue: value } };
    return { key, value: { stringValue: value } };
  });
}

/**
 * One tracer per Worker invocation. Not a global singleton: Workers isolate
 * state per request, and a module-level buffer would leak spans between
 * unrelated invocations that happen to share an isolate.
 */
export class Tracer {
  private readonly spans: FinishedSpan[] = [];
  private readonly traceId: string;
  private readonly sampled: boolean;
  private stack: string[] = [];

  constructor(private readonly opts: OtelOptions) {
    this.traceId = hex(16);
    this.sampled = Math.random() < (opts.sampleRatio ?? 1);
  }

  get id(): string {
    return this.traceId;
  }

  /**
   * Run `fn` inside a span. Records duration, status and error, then rethrows
   * so instrumentation never changes behaviour.
   */
  async span<T>(name: string, fn: () => Promise<T>, options: SpanOptions = {}): Promise<T> {
    if (!this.sampled) return fn();

    const spanId = hex(8);
    const parentSpanId = this.stack[this.stack.length - 1];
    this.stack.push(spanId);
    const start = Date.now();

    try {
      const result = await fn();
      this.record(name, spanId, parentSpanId, start, options, { code: OTEL_STATUS_OK });
      return result;
    } catch (e) {
      this.record(name, spanId, parentSpanId, start, options, {
        code: OTEL_STATUS_ERROR,
        message: e instanceof Error ? e.message : String(e),
      });
      throw e;
    } finally {
      this.stack.pop();
    }
  }

  /** Record a span that was measured elsewhere. */
  record(
    name: string,
    spanId: string,
    parentSpanId: string | undefined,
    startMs: number,
    options: SpanOptions,
    status: { code: number; message?: string } = { code: OTEL_STATUS_UNSET },
  ): void {
    if (!this.sampled) return;
    const span: FinishedSpan = {
      traceId: this.traceId,
      spanId,
      name,
      kind: options.kind ?? 1,
      startTimeUnixNano: `${startMs}000000`,
      endTimeUnixNano: `${Date.now()}000000`,
      attributes: toAttributes(options.attributes ?? {}),
      status,
    };
    if (parentSpanId !== undefined) span.parentSpanId = parentSpanId;
    this.spans.push(span);
  }

  /**
   * Ship the buffer. Pass the returned promise to `ctx.waitUntil` so the
   * response is not held up by the collector.
   *
   * Never throws: losing a trace must not fail the job that produced it.
   */
  async flush(): Promise<void> {
    if (!this.sampled || this.spans.length === 0) return;

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: toAttributes({
              'service.name': this.opts.serviceName,
              'service.version': this.opts.serviceVersion ?? '0.1.0',
              'deployment.environment': this.opts.environment ?? 'production',
            }),
          },
          scopeSpans: [{ scope: { name: 'ratchet' }, spans: this.spans }],
        },
      ],
    };

    try {
      const doFetch = this.opts.fetchImpl ?? fetch;
      await doFetch(this.opts.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.opts.headers ?? {}) },
        body: JSON.stringify(payload),
      });
    } catch {
      // Intentionally swallowed. See the class comment.
    } finally {
      this.spans.length = 0;
    }
  }
}

/** Null tracer for tests and local scripts. Same shape, no network. */
export function nullTracer(): Tracer {
  return new Tracer({
    endpoint: '',
    serviceName: 'test',
    sampleRatio: 0,
  });
}

export function tracerFromEnv(env: {
  OTEL_EXPORTER_OTLP_ENDPOINT?: string | undefined;
  OTEL_EXPORTER_OTLP_HEADERS?: string | undefined;
  ENVIRONMENT?: string | undefined;
}): Tracer | null {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) return null;
  const headers: Record<string, string> = {};
  // Standard OTEL_EXPORTER_OTLP_HEADERS format: "key1=value1,key2=value2"
  for (const pair of (env.OTEL_EXPORTER_OTLP_HEADERS ?? '').split(',')) {
    const idx = pair.indexOf('=');
    if (idx > 0) headers[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return new Tracer({
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    serviceName: 'ratchet-api',
    environment: env.ENVIRONMENT ?? 'production',
    headers,
  });
}
