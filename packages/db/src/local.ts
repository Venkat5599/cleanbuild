/**
 * Local database handle. Node and Bun only.
 *
 * Deliberately NOT exported from the package barrel. `bun:sqlite` cannot be
 * resolved by the Workers bundler, so any module a Worker imports must not be
 * able to reach it, even through a dynamic import: esbuild still analyses the
 * specifier statically and fails the build.
 *
 * Scripts and tests import this file directly. Worker code imports `fromD1`
 * from the barrel and never sees SQLite.
 */

import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema.js';
import type { Db } from './client.js';

export function fromFile(path = '.data/dev.db'): Db {
  const sqlite = new Database(path, { create: true });
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA foreign_keys = ON');
  return drizzle(sqlite, { schema }) as unknown as Db;
}
