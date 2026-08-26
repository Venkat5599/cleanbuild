/**
 * Seed eight weeks of shaped publishing history (T-105).
 *
 * The history is synthetic and labelled as such everywhere it is shown. Its
 * purpose is not to fake a real creator — it is to make the learning path
 * VERIFIABLE. A known ground truth is planted, so `scripts/verify-recovery.ts`
 * can assert that the posterior actually recovers it. Without a planted signal
 * you cannot tell a working bandit from a broken one.
 *
 * Ground truth planted here (in reward sigma units):
 *   hook_type:question              +0.60
 *   hook_type:contrarian            +0.25
 *   length_bucket:20m_plus          -0.40
 *   thumbnail_archetype:face_reaction +0.30
 *   format:shorts                   -0.20
 *
 * On top of that sit the confounds the baseline model exists to remove:
 * follower growth over the window, a weekend lift, and a posting-gap penalty.
 * If the pipeline is correct, those confounds end up in the baseline and only
 * the creative effects above survive into the posterior.
 *
 * Usage:  bun scripts/seed-history.ts [--weeks 8] [--posts-per-week 5]
 */

import { mkdir } from 'node:fs/promises';
import {
  FEATURE_SCHEMA_VERSION,
  createRng,
  encode,
  featureIndex,
  lengthBucketOf,
  publishSlotOf,
  type FeatureLabels,
  type Format,
  type HookType,
  type LengthBucket,
  type ThumbnailArchetype,
} from '../packages/core/src/index.js';
import { fromFile } from '../packages/db/src/local.js';
import type { Db } from '../packages/db/src/client.js';
import {
  CHECKPOINT_ORDER,
  closeExperiment,
  insertClaim,
  insertFeatures,
  insertPost,
  openExperiment,
  upsertCreator,
  upsertMetrics,
} from '../packages/db/src/queries.js';

export const PLANTED_EFFECTS: Array<[string, string, number]> = [
  ['hook_type', 'question', 0.6],
  ['hook_type', 'contrarian', 0.25],
  ['length_bucket', '20m_plus', -0.4],
  ['thumbnail_archetype', 'face_reaction', 0.3],
  ['format', 'shorts', -0.2],
];

export function plantedTheta(): Float64Array {
  const t = new Float64Array(35);
  for (const [dim, level, value] of PLANTED_EFFECTS) t[featureIndex(dim, level)] = value;
  return t;
}

const HOOKS: HookType[] = [
  'question',
  'claim',
  'number_list',
  'story_cold_open',
  'contrarian',
  'demo_first',
];
const THUMBS: ThumbnailArchetype[] = [
  'face_reaction',
  'text_dominant',
  'object_hero',
  'before_after',
  'none',
];
const FORMATS: Format[] = ['tutorial', 'commentary', 'vlog', 'interview', 'list', 'shorts'];

/** Durations chosen so every length bucket is exercised. */
const DURATIONS = [40, 150, 420, 900, 1500];

const TITLE_STEMS: Record<HookType, string[]> = {
  question: ['Why does', 'What happens when', 'Is it worth'],
  claim: ['This changes', 'The truth about', 'You are wrong about'],
  number_list: ['5 things', '3 mistakes', '7 rules for'],
  story_cold_open: ['The night I', 'I nearly quit', 'Nobody saw'],
  contrarian: ['Stop doing', 'Everyone is wrong about', 'Against'],
  demo_first: ['Watch this', 'Building', 'Live rebuild of'],
};

const SUBJECTS = [
  'the home studio rebuild',
  'my audio chain',
  'shooting in one take',
  'the cheap lens test',
  'editing at 2x speed',
  'the colour grade pass',
  'my thumbnail workflow',
  'the sponsor talk',
];

interface Options {
  weeks: number;
  postsPerWeek: number;
  seed: number;
  handle: string;
  niche: string;
  dbPath: string;
  /** Shift the whole window into the past, so no post lands inside the gate's cooldown horizon. */
  endOffsetDays?: number;
}

function parseArgs(argv: string[]): Options {
  const get = (flag: string, fallback: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
  };
  return {
    weeks: Number(get('--weeks', '40')),
    postsPerWeek: Number(get('--posts-per-week', '5')),
    seed: Number(get('--seed', '1337')),
    handle: get('--handle', 'demo-creator'),
    niche: get('--niche', 'making'),
    dbPath: get('--db', '.data/dev.db'),
  };
}

export async function seed(db: Db, opts: Options) {
  const rng = createRng(opts.seed);
  const theta = plantedTheta();

  const creator = await upsertCreator(db, {
    handle: opts.handle,
    platform: 'csv',
    niche: opts.niche,
    followers: 12_000,
    tz: 'Asia/Hong_Kong',
  });

  const totalPosts = opts.weeks * opts.postsPerWeek;
  // The window ends "now" so the newest experiments are genuinely mature —
  // unless the caller shifts it (the demo ages the history out of the canon
  // gate's cooldown window on purpose).
  const endMs = Date.now() - (opts.endOffsetDays ?? 0) * 86_400_000;
  const startMs = endMs - opts.weeks * 7 * 86_400_000;

  let lastPublishedMs = startMs - 3 * 86_400_000;
  let followers = 12_000;
  let inserted = 0;

  for (let i = 0; i < totalPosts; i++) {
    // Spread posts across the window with jitter, so day-of-week and gap
    // actually vary — a perfectly regular cadence would make the confound
    // model unidentifiable.
    const nominal = startMs + ((i + 0.5) / totalPosts) * (endMs - startMs);
    const jitterMs = (rng.next() - 0.5) * 1.6 * 86_400_000;
    const publishedAt = new Date(nominal + jitterMs);
    const hourJitter = 7 + Math.floor(rng.next() * 15);
    publishedAt.setHours(hourJitter, Math.floor(rng.next() * 60), 0, 0);

    const daysSinceLastPost = Math.max(
      0.25,
      (publishedAt.getTime() - lastPublishedMs) / 86_400_000,
    );
    lastPublishedMs = publishedAt.getTime();

    // Channel growth across the window — the loudest confound of all.
    followers = Math.round(12_000 * Math.exp(0.9 * ((publishedAt.getTime() - startMs) / (endMs - startMs))));

    const duration = DURATIONS[Math.floor(rng.next() * DURATIONS.length)]!;
    const hookType = HOOKS[Math.floor(rng.next() * HOOKS.length)]!;
    const labels: FeatureLabels = {
      hookType,
      lengthBucket: lengthBucketOf(duration) as LengthBucket,
      thumbnailArchetype: THUMBS[Math.floor(rng.next() * THUMBS.length)]!,
      publishSlot: publishSlotOf(publishedAt),
      format: FORMATS[Math.floor(rng.next() * FORMATS.length)]!,
      topicCluster: Math.floor(rng.next() * 8),
    };
    const x = encode(labels);

    // --- the generative model -------------------------------------------
    // creative effect (what the posterior must recover)
    let creative = 0;
    for (let j = 0; j < x.length; j++) creative += theta[j]! * x[j]!;

    // confounds (what the baseline must absorb)
    const dow = publishedAt.getDay();
    const weekendLift = dow === 0 || dow === 6 ? 0.22 : 0;
    const gapPenalty = -0.06 * daysSinceLastPost;
    const followerTerm = 0.85 * Math.log(followers);

    const noiseSd = 0.55;
    const logViews =
      -3.6 + followerTerm + weekendLift + gapPenalty + creative * noiseSd + rng.normal() * noiseSd;
    const views = Math.max(1, Math.round(Math.exp(logViews)));

    const stem = TITLE_STEMS[hookType][Math.floor(rng.next() * TITLE_STEMS[hookType].length)]!;
    const subject = SUBJECTS[Math.floor(rng.next() * SUBJECTS.length)]!;
    const title = `${stem} ${subject}`;

    const { id: postId } = await insertPost(db, {
      creatorId: creator.id,
      platformPostId: `seed-${i.toString().padStart(4, '0')}`,
      publishedAt,
      title,
      description: `Seeded history post ${i + 1} of ${totalPosts}. Synthetic.`,
      durationSeconds: duration,
      followersAtPublish: followers,
      raw: { synthetic: true, seed: opts.seed },
    });

    await insertFeatures(db, postId, FEATURE_SCHEMA_VERSION, labels, x, 'seed');

    // Metrics at every checkpoint. Views accumulate: roughly 55% by 24h and
    // 80% by 72h of the final 168h figure, which is the usual shape.
    const experimentId = await openExperiment(db, postId, creator.id, publishedAt);
    for (const checkpoint of CHECKPOINT_ORDER) {
      const share = checkpoint === '24h' ? 0.55 : checkpoint === '72h' ? 0.8 : 1;
      await upsertMetrics(
        db,
        postId,
        checkpoint,
        {
          views: Math.round(views * share),
          watchTime: Math.round(views * share * duration * 0.35),
          comments: Math.round(views * share * 0.004),
          likes: Math.round(views * share * 0.05),
          followerDelta: Math.round(views * share * 0.002),
        },
        new Date(
          publishedAt.getTime() +
            (checkpoint === '24h' ? 24 : checkpoint === '72h' ? 72 : 168) * 3_600_000,
        ),
      );
    }

    // Experiments stay OPEN here. Rewards are computed by the maturation job
    // from the baseline model, exactly as they are in production — seeding a
    // reward directly would bypass the very pipeline this data exists to test.
    void experimentId;
    inserted++;
  }

  // A small canon so the gate has something real to check against.
  const claimSeeds: Array<[string, number]> = [
    ['I will never take a sponsorship from an AI writing tool.', 40],
    ['Shooting in one take is the only way I work now.', 26],
    ['I think 20 minute videos are dead for this channel.', 12],
  ];
  for (const [text, daysAgo] of claimSeeds) {
    await insertClaim(db, {
      creatorId: creator.id,
      text,
      statedAt: new Date(endMs - daysAgo * 86_400_000),
    });
  }

  return { creatorId: creator.id, posts: inserted, weeks: opts.weeks };
}

if (import.meta.main) {
  const opts = parseArgs(process.argv.slice(2));
  await mkdir('.data', { recursive: true });
  const db = fromFile(opts.dbPath);
  const result = await seed(db, opts);
  console.log(
    `seeded creator ${result.creatorId}: ${result.posts} posts across ${result.weeks} weeks`,
  );
  console.log('experiments are OPEN — run the maturation job to compute rewards');
}
