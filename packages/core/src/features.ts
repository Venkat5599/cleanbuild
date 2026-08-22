/**
 * Creative feature space (PRD 8.1).
 *
 * Six categorical dimensions, one-hot encoded and concatenated to d=35.
 * Reward is modelled as additive over dimensions, which is what keeps the
 * action space linear instead of combinatorial (6*5*5*5*6*8 = 36,000 arms).
 */

export const FEATURE_SCHEMA_VERSION = 1;

export const HOOK_TYPES = [
  'question',
  'claim',
  'number_list',
  'story_cold_open',
  'contrarian',
  'demo_first',
] as const;

export const LENGTH_BUCKETS = ['under_60s', '1_4m', '4_10m', '10_20m', '20m_plus'] as const;

export const THUMBNAIL_ARCHETYPES = [
  'face_reaction',
  'text_dominant',
  'object_hero',
  'before_after',
  'none',
] as const;

export const PUBLISH_SLOTS = [
  'weekday_am',
  'weekday_pm',
  'weekday_late',
  'weekend_am',
  'weekend_pm',
] as const;

export const FORMATS = ['tutorial', 'commentary', 'vlog', 'interview', 'list', 'shorts'] as const;

/** Topic clusters are learned per creator; the slot count is fixed. */
export const TOPIC_CLUSTER_COUNT = 8;

export type HookType = (typeof HOOK_TYPES)[number];
export type LengthBucket = (typeof LENGTH_BUCKETS)[number];
export type ThumbnailArchetype = (typeof THUMBNAIL_ARCHETYPES)[number];
export type PublishSlot = (typeof PUBLISH_SLOTS)[number];
export type Format = (typeof FORMATS)[number];

export interface FeatureLabels {
  hookType: HookType;
  lengthBucket: LengthBucket;
  thumbnailArchetype: ThumbnailArchetype;
  publishSlot: PublishSlot;
  format: Format;
  /** 0-indexed, < TOPIC_CLUSTER_COUNT. */
  topicCluster: number;
}

/** Ordered dimension blocks. Order is part of the on-disk contract — appending
 *  is safe, reordering silently corrupts every stored posterior. */
export const DIMENSIONS = [
  { name: 'hook_type', levels: HOOK_TYPES as readonly string[] },
  { name: 'length_bucket', levels: LENGTH_BUCKETS as readonly string[] },
  { name: 'thumbnail_archetype', levels: THUMBNAIL_ARCHETYPES as readonly string[] },
  { name: 'publish_slot', levels: PUBLISH_SLOTS as readonly string[] },
  { name: 'format', levels: FORMATS as readonly string[] },
  {
    name: 'topic_cluster',
    levels: Array.from({ length: TOPIC_CLUSTER_COUNT }, (_, i) => `topic_${i}`),
  },
] as const;

export const FEATURE_DIM = DIMENSIONS.reduce((n, d) => n + d.levels.length, 0); // 35

/** Human-readable name of every coordinate, index-aligned with the vector. */
export const FEATURE_NAMES: string[] = DIMENSIONS.flatMap((d) =>
  d.levels.map((l) => `${d.name}:${l}`),
);

const OFFSETS: number[] = (() => {
  const offs: number[] = [];
  let acc = 0;
  for (const d of DIMENSIONS) {
    offs.push(acc);
    acc += d.levels.length;
  }
  return offs;
})();

function indexIn(levels: readonly string[], value: string, dimension: string): number {
  const i = levels.indexOf(value);
  if (i < 0) throw new Error(`unknown level "${value}" for dimension ${dimension}`);
  return i;
}

/** Encode labels to the one-hot feature vector. */
export function encode(labels: FeatureLabels): Float64Array {
  const x = new Float64Array(FEATURE_DIM);
  const values = [
    labels.hookType,
    labels.lengthBucket,
    labels.thumbnailArchetype,
    labels.publishSlot,
    labels.format,
    `topic_${labels.topicCluster}`,
  ];
  DIMENSIONS.forEach((dim, i) => {
    x[OFFSETS[i]! + indexIn(dim.levels, values[i]!, dim.name)] = 1;
  });
  return x;
}

/** Which coordinate carries a given dimension/level pair. */
export function featureIndex(dimension: string, level: string): number {
  const di = DIMENSIONS.findIndex((d) => d.name === dimension);
  if (di < 0) throw new Error(`unknown dimension ${dimension}`);
  return OFFSETS[di]! + indexIn(DIMENSIONS[di]!.levels, level, dimension);
}

/** Bucket a publish timestamp into a PublishSlot in the creator's local time. */
export function publishSlotOf(date: Date): PublishSlot {
  const day = date.getDay();
  const hour = date.getHours();
  const weekend = day === 0 || day === 6;
  if (weekend) return hour < 12 ? 'weekend_am' : 'weekend_pm';
  if (hour < 12) return 'weekday_am';
  if (hour < 20) return 'weekday_pm';
  return 'weekday_late';
}

/** Bucket a duration in seconds into a LengthBucket. */
export function lengthBucketOf(seconds: number): LengthBucket {
  if (seconds < 60) return 'under_60s';
  if (seconds < 240) return '1_4m';
  if (seconds < 600) return '4_10m';
  if (seconds < 1200) return '10_20m';
  return '20m_plus';
}
