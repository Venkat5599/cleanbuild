/**
 * Tests for the act step and the Canon Gate (FR-6 / FR-7).
 *
 * The invariants under test are the ones the demo and the submission depend
 * on: a round is scored against ONE posterior draw (C2), every gate rule
 * actually blocks what it claims to block, and a seeded round replays
 * identically.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate as drizzleMigrate } from 'drizzle-orm/bun-sqlite/migrator';
import { join } from 'node:path';
import {
  DEFAULT_NOISE_VAR,
  FEATURE_DIM,
  FEATURE_SCHEMA_VERSION,
  createRng,
  encode,
  flatPrior,
  initFromPrior,
  sampleTheta,
  update,
  type FeatureLabels,
  type Posterior,
} from '@ratchet/core';
import {
  insertClaim,
  insertFeatures,
  insertPost,
  putPosterior,
  upsertCreator,
  type Db,
} from '@ratchet/db';
import { fromFile } from '../../db/src/local.js';
import { candidatesForRound, generateBrief, ROUND_CANDIDATES } from '../src/index.js';

let seq = 0;
const paths: string[] = [];

/** A fresh migrated database per test, so no test can pollute another. */
function freshDb(): Db {
  const path = `.data/act-test-${process.pid}-${seq++}.db`;
  paths.push(path);
  const sqlite = new Database(path, { create: true });
  sqlite.exec('PRAGMA foreign_keys = ON');
  drizzleMigrate(drizzle(sqlite), {
    migrationsFolder: join(import.meta.dir, '..', '..', 'db', 'migrations'),
  });
  sqlite.close();
  return fromFile(path);
}

afterEach(() => {
  for (const p of paths.splice(0)) rmSync(p, { force: true });
});

function baseLabels(over: Partial<FeatureLabels> = {}): FeatureLabels {
  return {
    hookType: 'story_cold_open',
    lengthBucket: '4_10m',
    thumbnailArchetype: 'text_dominant',
    publishSlot: 'weekday_am',
    format: 'commentary',
    topicCluster: 0,
    ...over,
  };
}

async function seedCreator(db: Db) {
  return upsertCreator(db, {
    handle: `act-test-${Math.random().toString(36).slice(2, 8)}`,
    platform: 'csv',
    niche: 'making',
    followers: 10_000,
    tz: 'UTC',
  });
}

function posterior(updates: Array<[FeatureLabels, number]> = []): Posterior {
  let p = initFromPrior(flatPrior(), FEATURE_DIM);
  for (const [labels, reward] of updates) {
    p = update(p, encode(labels), reward, DEFAULT_NOISE_VAR);
  }
  return p;
}

describe('act round structure', () => {
  test('a round has exactly ROUND_CANDIDATES candidates and spans dimensions', () => {
    const updates: Array<[FeatureLabels, number]> = [
      [{ ...baseLabels(), format: 'tutorial' }, 1],
    ];
    const p = posterior(updates);
    const theta = sampleTheta(p, createRng(11));
    const round = candidatesForRound(p, theta);

    expect(round).toHaveLength(ROUND_CANDIDATES);
    // The round must not collapse into the greedy corner: at least two
    // different hooks and two different slots are represented, otherwise a
    // dead format or a repeated hook would poison the whole round.
    const hooks = new Set(round.map((c) => c.labels.hookType));
    const slots = new Set(round.map((c) => c.labels.publishSlot));
    expect(hooks.size).toBeGreaterThanOrEqual(2);
    expect(slots.size).toBeGreaterThanOrEqual(2);
  });

  test('the same draw replays the same ranking (one theta per round, C2)', () => {
    const updates: Array<[FeatureLabels, number]> = [
      [{ ...baseLabels(), hookType: 'question' }, 2],
    ];
    const p = posterior(updates);
    const theta = sampleTheta(p, createRng(3));
    const a = candidatesForRound(p, theta).map((c) => c.labels.hookType);
    const b = candidatesForRound(p, theta).map((c) => c.labels.hookType);
    expect(a).toEqual(b);
  });

  test('a healthy posterior surfaces a brief (proposed, not blocked)', async () => {
    const db = freshDb();
    const creator = await seedCreator(db);
    await putPosterior(db, creator.id, posterior());
    const result = await generateBrief(db, creator.id, { seed: 5 });
    expect(result.stance).toBe('proposed');
    expect(result.predictedLift).toBeFinite();
    expect(result.ciLow).toBeLessThanOrEqual(result.predictedLift);
    expect(result.ciHigh).toBeGreaterThanOrEqual(result.predictedLift);
  });

  test('a seeded round is deterministic: same seed, same headline', async () => {
    const db = freshDb();
    const creator = await seedCreator(db);
    await putPosterior(db, creator.id, posterior());
    const first = await generateBrief(db, creator.id, { seed: 9 });
    const second = await generateBrief(db, creator.id, { seed: 9 });
    expect(second.headline).toBe(first.headline);
  });
});

describe('canon gate rules', () => {
  test('dead_format blocks a draft whose feature the evidence has ruled out', async () => {
    const db = freshDb();
    const creator = await seedCreator(db);
    // Drive every dimension decisively negative so the shorts format is
    // ruled out with margin: P(helps) must fall well under the 0.20 bar.
    const updates: Array<[FeatureLabels, number]> = [];
    for (let i = 0; i < 20; i++) {
      updates.push([{ ...baseLabels(), format: 'shorts' as const }, -3.0]);
    }
    const p = posterior(updates);
    await putPosterior(db, creator.id, p);

    const result = await generateBrief(db, creator.id, {
      seed: 1,
      labels: { ...baseLabels(), format: 'shorts' },
    });
    expect(result.stance).toBe('blocked');
    const dead = result.gateEvents.find((e) => e.rule === 'dead_format');
    expect(dead?.verdict).toBe('block');
    expect(dead?.explanation).toContain('shorts');
  });

  test('hook_cooldown blocks a hook used inside the 14-day window', async () => {
    const db = freshDb();
    const creator = await seedCreator(db);
    await putPosterior(db, creator.id, posterior());

    const recent = new Date(Date.now() - 3 * 86_400_000);
    const { id: postId } = await insertPost(db, {
      creatorId: creator.id,
      platformPostId: `cooldown-${Date.now()}`,
      publishedAt: recent,
      title: 'the recent post',
      description: '',
      durationSeconds: 420,
      followersAtPublish: 10_000,
      raw: {},
    });
    const labels = baseLabels({ hookType: 'story_cold_open' });
    await insertFeatures(db, postId, FEATURE_SCHEMA_VERSION, labels, encode(labels), 'test');

    const result = await generateBrief(db, creator.id, {
      seed: 1,
      labels: baseLabels({ hookType: 'story_cold_open' }),
    });
    expect(result.stance).toBe('blocked');
    const cooldown = result.gateEvents.find((e) => e.rule === 'hook_cooldown');
    expect(cooldown?.verdict).toBe('block');
    expect(cooldown?.explanation).toContain('story_cold_open');
  });

  test('contradiction blocks a draft that overlaps a recorded canon claim', async () => {
    const db = freshDb();
    const creator = await seedCreator(db);
    await putPosterior(db, creator.id, posterior());
    await insertClaim(db, {
      creatorId: creator.id,
      text: 'I think 20 minute videos are dead for this channel.',
      statedAt: new Date(Date.now() - 40 * 86_400_000),
    });

    const result = await generateBrief(db, creator.id, {
      seed: 1,
      labels: { ...baseLabels(), lengthBucket: '20m_plus' },
      headlineOverride: '20 minute videos are dead for good',
    });
    expect(result.stance).toBe('blocked');
    const contradiction = result.gateEvents.find((e) => e.rule === 'contradiction');
    expect(contradiction?.verdict).toBe('block');
    expect(contradiction?.explanation).toContain('20 minute videos are dead');
  });

  test('an uncontested draft records pass verdicts for every rule', async () => {
    const db = freshDb();
    const creator = await seedCreator(db);
    await putPosterior(db, creator.id, posterior());
    const result = await generateBrief(db, creator.id, {
      seed: 3,
      labels: baseLabels(),
    });
    expect(result.stance).toBe('proposed');
    expect(result.gateEvents).toHaveLength(3);
    expect(result.gateEvents.every((e) => e.verdict === 'pass')).toBe(true);
  });
});