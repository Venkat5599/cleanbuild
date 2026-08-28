/**
 * Standalone cron jobs for the RATCHET API on a VPS (no Cloudflare).
 *
 * Mirrors the Worker's scheduled() handler against a bun:sqlite file:
 *
 *   bun scripts/cron-jobs.ts hourly   # mature due experiments + follow-up
 *   bun scripts/cron-jobs.ts nightly  # refit every posterior + pool niches
 *
 * Crontab:
 *   0 * * * *  cd /opt/ratchet && bun scripts/cron-jobs.ts hourly  >> cron.log 2>&1
 *   0 3 * * *  cd /opt/ratchet && bun scripts/cron-jobs.ts nightly >> cron.log 2>&1
 *
 * Env: RATCHET_DB_PATH, MINDS_BUILDER_API_KEY, MINDS_ALIAS,
 *      TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
 */

import { fromFile } from '../packages/db/src/local.js';
import { listCreators } from '../packages/db/src/queries.js';
import { matureDueExperiments, refitCreator, poolNiches, systemClock } from '../packages/pipeline/src/learn.js';
import { MindsClient } from '../packages/mind/src/client.js';
import { runFollowUp } from '../apps/api/src/followup.js';

const mode = process.argv[2] ?? 'hourly';
if (mode !== 'hourly' && mode !== 'nightly') {
  console.error('usage: bun scripts/cron-jobs.ts hourly|nightly');
  process.exit(1);
}

function log(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, at: new Date().toISOString(), ...data }));
}

const db = fromFile(process.env.RATCHET_DB_PATH ?? '.data/dev.db');

const minds =
  process.env.MINDS_BUILDER_API_KEY && process.env.MINDS_ALIAS
    ? new MindsClient({ apiKey: process.env.MINDS_BUILDER_API_KEY })
    : null;
const telegram =
  process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
    ? { botToken: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID }
    : null;

if (mode === 'hourly') {
  const matured = await matureDueExperiments(db, systemClock, 500);
  const report = await runFollowUp({ db, minds, mindAlias: process.env.MINDS_ALIAS ?? null, telegram, log });
  log('cron.hourly.done', {
    matured: matured.length,
    closed: report.closed,
    voided: report.voided,
    sent: report.notificationsSent,
    suppressed: report.notificationsSuppressed,
  });
} else {
  for (const creator of await listCreators(db)) {
    const refit = await refitCreator(db, creator.id, systemClock);
    log('cron.refit', { creatorId: creator.id, nClosed: refit.nClosed, drift: refit.drift });
  }
  for (const o of await poolNiches(db)) {
    log('cron.pool', { niche: o.niche, creators: o.creators, pooled: o.pooled, tau2: o.tau2 });
  }
  log('cron.nightly.done', {});
}

(db as unknown as { $client: { close(): void } }).$client.close();