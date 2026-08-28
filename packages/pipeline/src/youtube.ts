/**
 * YouTube connector (FR-10).
 *
 * Turns a public YouTube channel into RATCHET experiments. Two operations:
 *
 *   ingestChannel  — one-time discovery: latest uploads become posts with
 *                    heuristically labelled features (labeledBy 'heuristic',
 *                    never 'mind' — these labels are rules, not judgement)
 *                    and an open experiment each.
 *   pollChannel    — repeated (hourly via cron): for every experiment whose
 *                    next checkpoint is due, fetch CURRENT stats and write
 *                    them into the due checkpoint. The value is the stats at
 *                    poll time, which sits at the checkpoint boundary; poll
 *                    cadence decides the approximation.
 *
 * Everything is gated on YOUTUBE_API_KEY — without it the module exists but
 * nothing runs, exactly like the embedding gate.
 */

import type { FeatureLabels } from '@ratchet/core';
import {
  FEATURE_SCHEMA_VERSION,
  FORMATS,
  HOOK_TYPES,
  LENGTH_BUCKETS,
  PUBLISH_SLOTS,
  THUMBNAIL_ARCHETYPES,
  encode,
} from '@ratchet/core';
import {
  advanceCheckpoint,
  checkpointFor,
  dueExperiments,
  getPost,
  insertFeatures,
  insertPost,
  nextCheckpoint,
  openExperiment,
  upsertMetrics,
  type Db,
} from '@ratchet/db';

const YT_API = 'https://www.googleapis.com/youtube/v3';

// ------------------------------------------------------------------ labelling
// These are mechanical, documented heuristics. They are deliberately coarse:
// RATCHET learns causal feature effects from outcomes, so a label only needs
// to be consistent, not brilliant. The label is frozen at ingest and the
// labeledBy column records that it was a rule, not a Mind.

export interface HeuristicLabels {
  hookType: (typeof HOOK_TYPES)[number];
  format: (typeof FORMATS)[number];
  thumbnailArchetype: (typeof THUMBNAIL_ARCHETYPES)[number];
}

export function labelFromTitle(title: string): HeuristicLabels {
  const t = title.toLowerCase().trim();
  let hookType: (typeof HOOK_TYPES)[number] = 'claim';
  let format: (typeof FORMATS)[number] = 'commentary';
  let thumbnailArchetype: (typeof THUMBNAIL_ARCHETYPES)[number] = 'face_reaction';

  if (t.endsWith('?')) hookType = 'question';
  else if (/^\d+\s+(things|ways|tips|ideas|tricks|reasons)/.test(t)) {
    hookType = 'number_list';
    thumbnailArchetype = 'text_dominant';
  } else if (/\bvs\.?\b/.test(t)) hookType = 'contrarian';
  else if (/^(i tried|i tested|i built|i made|we tried|we tested)/.test(t)) hookType = 'story_cold_open';

  if (/^how (to|i)/.test(t) || /\b(in|under) \d+ (minutes|seconds)/.test(t)) format = 'tutorial';
  else if (/^\d+\s+(things|ways|tips|ideas|tricks|reasons)/.test(t)) format = 'list';
  else if (/\b(vs|review|reaction|explained)\b/.test(t)) format = 'commentary';
  else if (/\b(vlog|day in my life|week in my life)\b/.test(t)) format = 'vlog';
  else if (/\b(interview|qa|q&a|ama)\b/.test(t)) format = 'interview';
  if (hookType === 'story_cold_open' && format === 'commentary') format = 'vlog';

  return { hookType, format, thumbnailArchetype };
}

export function lengthBucketOf(durationSeconds: number): (typeof LENGTH_BUCKETS)[number] {
  if (durationSeconds < 60) return 'under_60s';
  if (durationSeconds < 4 * 60) return '1_4m';
  if (durationSeconds < 10 * 60) return '4_10m';
  if (durationSeconds < 20 * 60) return '10_20m';
  return '20m_plus';
}

export function publishSlotOf(publishedAt: Date): (typeof PUBLISH_SLOTS)[number] {
  const day = publishedAt.getUTCDay();
  const hour = publishedAt.getUTCHours();
  const weekend = day === 0 || day === 6;
  if (weekend) return hour < 12 ? 'weekend_am' : 'weekend_pm';
  if (hour < 12) return 'weekday_am';
  if (hour < 17) return 'weekday_pm';
  return 'weekday_late';
}

export function videoIdOf(url: string): string | null {
  const m = url.match(/[?&]v=([\w-]{11})/) ?? url.match(/\/([\w-]{11})(?:[?/]|$)/);
  return m ? m[1]! : null;
}

// -------------------------------------------------------------------- network

export interface YtVideo {
  videoId: string;
  title: string;
  publishedAt: Date;
  durationSeconds: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

async function ytJson<T>(apiKey: string, path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ key: apiKey, ...params }).toString();
  const res = await fetch(`${YT_API}${path}?${qs}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube ${path} failed with ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function fetchChannelId(apiKey: string, handle: string): Promise<string> {
  const data = await ytJson<{ items: Array<{ id: string }> }>(apiKey, '/channels', {
    part: 'id',
    forHandle: handle.startsWith('@') ? handle : `@${handle}`,
  });
  const id = data.items[0]?.id;
  if (!id) throw new Error(`no YouTube channel found for handle ${handle}`);
  return id;
}

export async function fetchRecentVideos(
  apiKey: string,
  channelId: string,
  maxResults = 15,
): Promise<YtVideo[]> {
  const uploads = await ytJson<{ items: Array<{ contentDetails: { relatedPlaylistId: string } }> }>(
    apiKey,
    '/channels',
    { part: 'contentDetails', id: channelId },
  );
  const playlistId = uploads.items[0]?.contentDetails.relatedPlaylistId;
  if (!playlistId) return [];

  const items = await ytJson<{
    items: Array<{ contentDetails: { videoId: string }; snippet: { title: string; publishedAt: string } }>;
  }>(apiKey, '/playlistItems', {
    part: 'snippet,contentDetails',
    playlistId,
    maxResults: String(maxResults),
  });

  const ids = items.items.map((i) => i.contentDetails.videoId).join(',');
  if (!ids) return [];

  const vids = await ytJson<{
    items: Array<{
      id: string;
      snippet: { title: string; publishedAt: string };
      contentDetails: { duration: string };
      statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
    }>;
  }>(apiKey, '/videos', { part: 'snippet,contentDetails,statistics', id: ids });

  return vids.items.map((v) => ({
    videoId: v.id,
    title: v.snippet.title,
    publishedAt: new Date(v.snippet.publishedAt),
    durationSeconds: iso8601DurationSeconds(v.contentDetails.duration),
    viewCount: Number(v.statistics.viewCount ?? 0),
    likeCount: Number(v.statistics.likeCount ?? 0),
    commentCount: Number(v.statistics.commentCount ?? 0),
  }));
}

export function iso8601DurationSeconds(d: string): number {
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0));
}

export function labelsOf(v: YtVideo): FeatureLabels {
  const h = labelFromTitle(v.title);
  return {
    hookType: h.hookType,
    format: h.format,
    thumbnailArchetype: h.thumbnailArchetype,
    lengthBucket: lengthBucketOf(v.durationSeconds),
    publishSlot: publishSlotOf(v.publishedAt),
    topicCluster: 0,
  };
}

// --------------------------------------------------------------------- ingest

export interface IngestResult {
  inserted: number;
  skipped: number;
}

export async function ingestChannel(
  db: Db,
  opts: { apiKey: string; handle: string; creatorId: number; followersAtPublish: number; maxResults?: number },
): Promise<IngestResult> {
  const channelId = await fetchChannelId(opts.apiKey, opts.handle);
  const videos = await fetchRecentVideos(opts.apiKey, channelId, opts.maxResults ?? 15);

  let inserted = 0;
  let skipped = 0;
  for (const v of videos) {
    const { id, inserted: isNew } = await insertPost(db, {
      creatorId: opts.creatorId,
      platformPostId: `yt-${v.videoId}`,
      publishedAt: v.publishedAt,
      title: v.title,
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
      durationSeconds: v.durationSeconds,
      followersAtPublish: opts.followersAtPublish,
      raw: { source: 'youtube', labeledBy: 'heuristic' },
    });
    if (!isNew) {
      skipped++;
      continue;
    }
    await insertFeatures(db, id, FEATURE_SCHEMA_VERSION, labelsOf(v), encode(labelsOf(v)), 'heuristic');
    await openExperiment(db, id, opts.creatorId, v.publishedAt);
    inserted++;
  }
  return { inserted, skipped };
}

// ---------------------------------------------------------------------- poll

export interface PollResult {
  due: number;
  metricsWritten: number;
  failed: string[];
}

export async function pollChannel(
  db: Db,
  opts: { apiKey: string; handle: string; now?: Date },
): Promise<PollResult> {
  const now = opts.now ?? new Date();
  const { apiKey } = opts;
  const channelId = await fetchChannelId(apiKey, opts.handle);
  const due = await dueExperiments(db, now);

  const videoIds = new Map<number, string>();
  for (const exp of due) {
    const post = await getPost(db, exp.postId);
    if (!post?.platformPostId.startsWith('yt-')) continue;
    videoIds.set(exp.postId, post.platformPostId.slice(3));
  }
  if (videoIds.size === 0) return { due: due.length, metricsWritten: 0, failed: [] };

  const ids = [...videoIds.values()].join(',');
  const vids = await ytJson<{
    items: Array<{
      id: string;
      statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
    }>;
  }>(apiKey, '/videos', { part: 'statistics', id: ids });

  const byId = new Map(vids.items.map((v) => [v.id, v]));
  let metricsWritten = 0;
  const failed: string[] = [];
  for (const [postId, videoId] of videoIds) {
    const exp = due.find((e) => e.postId === postId);
    const stats = byId.get(videoId);
    if (!exp || !stats) {
      failed.push(videoId);
      continue;
    }
    const checkpoint = checkpointFor(exp.openedAt, now.getTime());
    await upsertMetrics(db, postId, checkpoint, {
      views: Number(stats.statistics.viewCount ?? 0),
      likes: Number(stats.statistics.likeCount ?? 0),
      comments: Number(stats.statistics.commentCount ?? 0),
    });
    const next = nextCheckpoint(checkpoint);
    if (next) await advanceCheckpoint(db, exp.id, new Date(now.getTime()));
    metricsWritten++;
  }
  return { due: due.length, metricsWritten, failed };
}