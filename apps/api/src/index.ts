/**
 * RATCHET API — Hono on Cloudflare Workers.
 *
 * Two entry points:
 *   fetch()      the oRPC API the dashboard talks to
 *   scheduled()  the Cron Trigger that closes the learning loop with no human
 *
 * The scheduled handler is the important one. Everything the submission claims
 * about autonomy is provable by reading it: it takes no request, reads no
 * session, and can run with every browser closed.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { RPCHandler } from '@orpc/server/fetch';
import { fromD1, type Db } from '@ratchet/db';
import { MindsClient } from '@ratchet/mind';
import { refitCreator, systemClock } from '@ratchet/pipeline';
import { listCreators } from '@ratchet/db';
import {
  CRON_LOCK_KEY,
  CRON_LOCK_TTL_SECONDS,
  MetricsStore,
  Observability,
  authorizeMetrics,
  redisFromEnv,
  tracerFromEnv,
  type AnalyticsEngineDataset,
} from '@ratchet/observability';
import { runFollowUp } from './followup.js';
import { router } from './router.js';

export interface Env {
  DB: D1Database;
  MINDS_BUILDER_API_KEY?: string;
  MINDS_ALIAS?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  /** Comma-separated origins allowed to call the API. */
  ALLOWED_ORIGINS?: string;
  ENVIRONMENT?: string;
  /** Upstash Redis over HTTP. Workers cannot hold TCP Redis connections. */
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  /** Cloudflare Analytics Engine binding, optional. */
  ANALYTICS?: AnalyticsEngineDataset;
  /** OTLP/HTTP trace collector. Any OTel-compatible backend. */
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_HEADERS?: string;
  /** Bearer token required to scrape /metrics. */
  METRICS_TOKEN?: string;
}

export interface RequestContext {
  db: Db;
  env: Env;
}

function mindsFor(env: Env): MindsClient | null {
  if (!env.MINDS_BUILDER_API_KEY) return null;
  return new MindsClient({ apiKey: env.MINDS_BUILDER_API_KEY });
}

function telegramFor(env: Env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return null;
  return { botToken: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID };
}

/** Structured log line. Never include secrets or full request bodies. */
function log(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, at: new Date().toISOString(), ...data }));
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const handler = cors({
    origin: allowed.length > 0 ? allowed : 'http://localhost:3000',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  });
  return handler(c, next);
});

app.get('/health', (c) => c.json({ ok: true, service: 'ratchet-api' }));

const rpc = new RPCHandler(router);

app.use('/rpc/*', async (c, next) => {
  const { matched, response } = await rpc.handle(c.req.raw, {
    prefix: '/rpc',
    context: { db: fromD1(c.env.DB), env: c.env } satisfies RequestContext,
  });
  if (matched) return c.newResponse(response.body, response);
  return next();
});

/**
 * Prometheus scrape endpoint.
 *
 * Token-protected on purpose. An open /metrics tells an attacker how the system
 * behaves and how often it fails, which is reconnaissance. Returns 404 rather
 * than 401 when the token is wrong, so the endpoint's existence is not
 * confirmed to an unauthorised caller.
 */
app.get('/metrics', async (c) => {
  if (!authorizeMetrics(c.req.header('authorization') ?? null, c.env.METRICS_TOKEN)) {
    return c.notFound();
  }
  const body = await new MetricsStore(redisFromEnv(c.env)).render();
  return c.text(body, 200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
});

/**
 * Manual trigger for the same job the cron runs.
 *
 * Exists so the demo can show the autonomous path on command rather than
 * waiting for the hour to turn. It runs the identical code path; there is no
 * separate "demo mode" that behaves differently from production.
 */
app.post('/admin/run-followup', async (c) => {
  const report = await runFollowUp({
    db: fromD1(c.env.DB),
    minds: mindsFor(c.env),
    mindAlias: c.env.MINDS_ALIAS ?? null,
    telegram: telegramFor(c.env),
    log,
  });
  return c.json(report);
});

export default {
  fetch: app.fetch,

  /**
   * Cron Trigger. Configured in wrangler.toml:
   *   hourly  maturation and autonomous follow-up
   *   nightly baseline refit and full posterior recompute
   */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = fromD1(env.DB);
    const obs = new Observability({
      service: 'ratchet-api',
      environment: env.ENVIRONMENT ?? 'production',
      analytics: env.ANALYTICS ?? null,
    });
    const tracer = tracerFromEnv(env);
    const metrics = new MetricsStore(redisFromEnv(env));
    obs.event('cron.start', { cron: event.cron, traceId: tracer?.id ?? null });

    ctx.waitUntil(
      (async () => {
        // Overlapping cron invocations are the one failure that corrupts
        // beliefs silently: both ticks close the same experiments, the
        // posterior takes each observation twice, and the creator gets two
        // messages about one result. The lock makes that impossible.
        const redis = redisFromEnv(env);
        const lock = redis
          ? await redis.acquireLock(CRON_LOCK_KEY, CRON_LOCK_TTL_SECONDS)
          : { acquired: true, degraded: true, key: CRON_LOCK_KEY, release: async () => {} };

        if (!lock.acquired) {
          obs.event('cron.skipped', { reason: 'another invocation holds the lock' }, 'warn');
          await metrics.increment('ratchet_cron_skipped_total');
          return;
        }
        if (lock.degraded) {
          // Redis is unreachable or unconfigured. Learning continues, because
          // an outage that stops all learning is worse than a missed lock, but
          // the risk is recorded rather than hidden.
          obs.event('cron.lock_degraded', { key: lock.key }, 'warn');
        }

        const startedAt = Date.now();
        try {
          await metrics.increment('ratchet_cron_runs_total');
          const runFollowUpTraced = () =>
            tracer
              ? tracer.span('followup', () =>
                  runFollowUp({
                    db,
                    minds: mindsFor(env),
                    mindAlias: env.MINDS_ALIAS ?? null,
                    telegram: telegramFor(env),
                    log: (e, d) => obs.event(e, d as Record<string, string | number | boolean>),
                  }),
                )
              : runFollowUp({
                  db,
                  minds: mindsFor(env),
                  mindAlias: env.MINDS_ALIAS ?? null,
                  telegram: telegramFor(env),
                  log: (e, d) => obs.event(e, d as Record<string, string | number | boolean>),
                });

          const report = await obs.span('cron.followup', runFollowUpTraced);

          await metrics.increment('ratchet_experiments_closed_total', report.closed);
          await metrics.increment('ratchet_experiments_voided_total', report.voided);
          await metrics.increment('ratchet_notifications_sent_total', report.notificationsSent);
          await metrics.increment(
            'ratchet_notifications_suppressed_total',
            report.notificationsSuppressed,
          );
          await metrics.increment(
            'ratchet_notifications_undelivered_total',
            report.details.filter((d) => d.delivered === 'stored').length,
          );
          await metrics.setGauge('ratchet_followup_duration_ms', Date.now() - startedAt);

          obs.event('cron.followup.report', {
            matured: report.matured,
            closed: report.closed,
            voided: report.voided,
            sent: report.notificationsSent,
            suppressed: report.notificationsSuppressed,
          });

          // The nightly cron additionally rebuilds every posterior from the
          // ledger with a full solve and reports drift from the incremental
          // path. A growing drift is the early warning that the rank-1 update
          // has a bug, so it is logged rather than swallowed.
          if (event.cron === '0 3 * * *') {
            for (const creator of await listCreators(db)) {
              const refit = await refitCreator(db, creator.id, systemClock);
              obs.event(
                'cron.refit',
                {
                  creatorId: creator.id,
                  nClosed: refit.nClosed,
                  drift: refit.drift,
                },
                // Drift above this means the incremental path and the full
                // solve have genuinely diverged, which is a correctness bug,
                // not noise. Floating point alone stays near 1e-15.
                refit.drift > 1e-6 ? 'warn' : 'info',
              );
              await metrics.setGauge('ratchet_posterior_drift', refit.drift);
              await metrics.setGauge('ratchet_closed_experiments', refit.nClosed);
            }
          }
        } catch (e) {
          obs.error('cron.failed', e, { cron: event.cron });
          await metrics.increment('ratchet_cron_failures_total');
          throw e;
        } finally {
          await lock.release();
          // Flushed last so the trace includes the whole run, and swallowed
          // internally so a collector outage cannot fail the job.
          await tracer?.flush();
        }
      })(),
    );
  },
};
