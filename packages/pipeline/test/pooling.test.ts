/**
 * Integration tests for the nightly pooling job (poolNiches).
 *
 * Distinguishes the two failure modes that matter: a thin niche must stay
 * honest ("not pooled") and never collapse onto a phantom prior, and a niche
 * with enough creators must actually persist a pooled prior whose weight is
 * sane — the pool can inform, but it must not be able to erase a creator's
 * own history.
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
  encode,
  flatPrior,
  initFromPrior,
  update,
  type FeatureLabels,
  type Posterior,
} from '@ratchet/core';
import { fromFile } from '../../db/src/local.js';
import { getNichePrior, putPosterior, upsertCreator, type Db } from '@ratchet/db';
import { poolNiches } from '../src/index.js';
import { poolingWeights } from '../../core/src/pooling.js';

let seq = 0;
const paths: string[] = [];

function freshDb(): Db {
  const path = `.data/pool-test-${process.pid}-${seq++}.db`;
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

const base: FeatureLabels = {
  hookType: 'question',
  lengthBucket: '4_10m',
  thumbnailArchetype: 'face_reaction',
  publishSlot: 'weekday_pm',
  format: 'tutorial',
  topicCluster: 0,
};

/** A posterior with a known true effect and 40 observations behind it. */
function maker(effect: number, nObs = 40): Posterior {
  let p = initFromPrior(flatPrior(), FEATURE_DIM);
  for (let i = 0; i < nObs; i++) {
    p = update(p, encode(base), effect, DEFAULT_NOISE_VAR);
  }
  return p;
}

describe('poolNiches', () => {
  test('a niche with one creator is reported as not pooled and keeps a sane prior', async () => {
    const db = freshDb();
    const c = await upsertCreator(db, { handle: 'solo', platform: 'csv', niche: 'solo', followers: 1, tz: 'UTC' });
    await putPosterior(db, c.id, maker(0.4, 40));

    const outcomes = await poolNiches(db);
    const solo = outcomes.find((o) => o.niche === 'solo');
    expect(solo?.pooled).toBe(false);
    expect(solo?.creators).toBe(1);

    // The fallback (flat) prior must be what is stored, and poolingWeights
    // must still show own data dominating — a thin niche cannot hijack anyone.
    const stored = await getNichePrior(db, 'solo');
    expect(stored?.pooled).toBe(false);
    expect(poolingWeights(40, stored?.prior.tau2 ?? 0.25).own).toBeGreaterThan(0.5);
  });

  test('three creators in a niche persist a pooled prior with sane weight', async () => {
    const db = freshDb();
    const handles = ['a', 'b', 'c'];
    // Genuinely different true effects: the pool has real between-creator
    // spread to estimate, which is the only honest way to pool.
    const effects = [0.3, 0.9, 1.5];
    for (let i = 0; i < 3; i++) {
      const c = await upsertCreator(db, { handle: handles[i]!, platform: 'csv', niche: 'music', followers: 1, tz: 'UTC' });
      await putPosterior(db, c.id, maker(effects[i]!, 40));
    }

    const outcomes = await poolNiches(db);
    const music = outcomes.find((o) => o.niche === 'music');
    expect(music?.pooled).toBe(true);
    expect(music?.creators).toBe(3);
    expect(music!.tau2).toBeGreaterThan(0);

    // The pool carries weight for young creators (that is its purpose) but
    // it must never be able to erase a full history: at the floor tau2 the
    // niche prior is ~100 pseudo-observations, so a creator with 194 closed
    // experiments is still mostly their own data.
    expect(poolingWeights(40, music!.tau2).own).toBeGreaterThan(0);
    expect(poolingWeights(40, music!.tau2).own).toBeLessThan(1);
    expect(poolingWeights(194, music!.tau2).own).toBeGreaterThan(0.6);
  });

  test('poolNiches keeps its fallback when a niche has no posteriors at all', async () => {
    const db = freshDb();
    const c = await upsertCreator(db, { handle: 'cold', platform: 'csv', niche: 'cold', followers: 1, tz: 'UTC' });
    void c; // no posterior written — the cold-start state

    const outcomes = await poolNiches(db);
    const cold = outcomes.find((o) => o.niche === 'cold');
    // One creator with no posterior is excluded from the pool; nothing is
    // fabricated for it, and it falls back to the flat prior downstream.
    expect(cold?.creators).toBe(0);
    expect(cold?.pooled).toBe(false);
    expect(cold?.tau2).toBeGreaterThan(0);
  });
});