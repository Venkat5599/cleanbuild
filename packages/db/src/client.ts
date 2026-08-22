/**
 * Database handles.
 *
 * Two runtimes, one schema:
 *   - Cloudflare Workers bind a D1 database (production, cron, the API).
 *   - Local scripts and tests open a bun:sqlite file, so seeding and the
 *     time-travel demo run with no network and no wrangler process.
 *
 * Both return the same Drizzle type, so every query in queries.ts is written
 * once and runs in either place.
 */

import { drizzle as drizzleD1, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema.js';

export type Db = DrizzleD1Database<typeof schema>;

/** Cloudflare Workers path. */
export function fromD1(binding: D1Database): Db {
  return drizzleD1(binding, { schema });
}

/** Float64Array to a blob for storage. */
export function toBlob(arr: Float64Array): Buffer {
  return Buffer.from(arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength));
}

/** Blob back to Float64Array. Copies, because the source may be unaligned. */
export function fromBlob(buf: Uint8Array | ArrayBuffer): Float64Array {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Float64Array(copy);
}
