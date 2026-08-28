/**
 * YouTube import CLI: discover a channel's uploads as experiments, then poll
 * due checkpoints with current stats.
 *
 *   bun scripts/import-youtube.ts --handle @somechannel --creator 2 [--db .data/dev.db]
 *
 * Requires YOUTUBE_API_KEY. First run ingests (new posts + heuristic
 * features + an open experiment per video); every later run polls the open
 * experiments whose next checkpoint is due. Idempotent by design.
 */

import { ingestChannel, pollChannel } from '../packages/pipeline/src/youtube.js';
import { fromFile } from '../packages/db/src/local.js';

const args = process.argv.slice(2);
const handleOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const dbPath = handleOf('--db') ?? '.data/dev.db';
const handle = handleOf('--handle');
const creator = Number(handleOf('--creator') ?? '1');
const apiKey = process.env.YOUTUBE_API_KEY ?? '';

if (!handle) {
  console.error('usage: bun scripts/import-youtube.ts --handle @channel --creator N [--db path]');
  process.exit(1);
}
if (!apiKey) {
  console.error('YOUTUBE_API_KEY is not set — the connector is inert without it.');
  process.exit(1);
}

const db = fromFile(dbPath);

const ingest = await ingestChannel(db, {
  apiKey,
  handle,
  creatorId: creator,
  followersAtPublish: 0,
});
console.log(`[youtube] ingest ${handle}: ${ingest.inserted} new, ${ingest.skipped} already tracked`);

const poll = await pollChannel(db, { apiKey, handle });
console.log(
  `[youtube] poll ${handle}: ${poll.due} due, ${poll.metricsWritten} metrics written` +
    (poll.failed.length ? `, failed ${poll.failed.join(',')}` : ''),
);