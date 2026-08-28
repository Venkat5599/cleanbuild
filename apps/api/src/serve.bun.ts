/**
 * Standalone HTTP entry for the RATCHET API on Bun (VPS / bare metal).
 *
 * The Cloudflare Worker entry (index.ts) binds D1; this entry binds a
 * bun:sqlite file through the same `buildApp` — one Hono app, same routes,
 * same read-only oRPC contract, no Cloudflare required.
 *
 *   RATCHET_DB_PATH  path to the SQLite ledger (default .data/dev.db)
 *   PORT             listen port (default 8787)
 *   ALLOWED_ORIGINS  comma-separated browser origins for CORS (optional;
 *                    server-to-server callers like the dashboard's Server
 *                    Components do not need CORS)
 */

import type { D1Database } from '@cloudflare/workers-types';
import { fromFile } from '../../../packages/db/src/local.js';
import { buildApp, type Env } from './index.js';

const dbPath = process.env.RATCHET_DB_PATH ?? '.data/dev.db';
const db = fromFile(dbPath);
const app = buildApp(() => db);

const env: Env = {
  // The DB binding is unused by buildApp — the handle comes from the closure.
  DB: null as unknown as D1Database,
  ENVIRONMENT: process.env.ENVIRONMENT ?? 'production',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? '',
  MINDS_BUILDER_API_KEY: process.env.MINDS_BUILDER_API_KEY,
  MINDS_ALIAS: process.env.MINDS_ALIAS,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  METRICS_TOKEN: process.env.METRICS_TOKEN,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  OTEL_EXPORTER_OTLP_HEADERS: process.env.OTEL_EXPORTER_OTLP_HEADERS,
};

const port = Number(process.env.PORT ?? 8787);
Bun.serve({ port, hostname: '0.0.0.0', fetch: (req) => app.fetch(req, env) });
console.log(`ratchet api listening on http://0.0.0.0:${port} (db ${dbPath})`);