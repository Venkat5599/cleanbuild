/**
 * Apply Drizzle migrations to the local SQLite database.
 * Production (D1) is migrated with `wrangler d1 migrations apply`.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

const dbPath = process.argv.includes('--db')
  ? process.argv[process.argv.indexOf('--db') + 1]!
  : '.data/dev.db';

await mkdir('.data', { recursive: true });
const sqlite = new Database(dbPath, { create: true });
sqlite.exec('PRAGMA foreign_keys = ON');
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: join(import.meta.dir, '..', 'packages', 'db', 'migrations') });
console.log(`migrations applied to ${dbPath}`);
