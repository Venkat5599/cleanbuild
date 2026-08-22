/**
 * Build the memory graph from the ledger, and prove it retrieves.
 *
 * Runs the real consolidation over the verified posterior, extracts claims from
 * a sample of posts, then answers a retrieval query the way the Mind would see
 * it. Exit code 0 means the memory architecture works end to end.
 *
 * Usage:
 *   bun run scripts/build-memory.ts            # consolidation only, no network
 *   bun run scripts/build-memory.ts --extract  # also run claim extraction
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { fromFile } from '../packages/db/src/local.js';
import { closedExperiments, getPosterior, listCreators, listPosts } from '../packages/db/src/queries.js';
import {
  Extractor,
  claimToFact,
  consolidate,
  formatForMind,
  retrieve,
  validateFact,
  type Fact,
} from '../packages/memory/src/index.js';

const withExtraction = process.argv.includes('--extract');
const db = fromFile('.data/dev.db');

const creators = await listCreators(db);
if (creators.length === 0) {
  console.error('no creators. run: bun run scripts/seed-history.ts');
  process.exit(1);
}
const creator = creators[0]!;

const posterior = await getPosterior(db, creator.id);
if (!posterior) {
  console.error('no posterior. run: bun run scripts/verify-recovery.ts');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Consolidate: episodes become beliefs, each citing its evidence.
// ---------------------------------------------------------------------------

const ledger = await closedExperiments(db, creator.id);
const beliefs = consolidate({
  creatorId: creator.id,
  posterior,
  experimentIds: ledger.map((e) => e.experimentId),
});

console.log(`consolidated ${beliefs.length} beliefs from ${ledger.length} closed experiments`);

// Every belief must be valid, and validation requires provenance. If this
// throws, something wrote a belief with no evidence behind it.
let invalid = 0;
for (const f of beliefs) {
  const errors = validateFact(f);
  if (errors.length > 0) {
    invalid++;
    console.error(`  INVALID ${f.id}: ${errors.map((e) => e.problem).join('; ')}`);
  }
}

const facts: Fact[] = [...beliefs];

// ---------------------------------------------------------------------------
// 2. Extract claims from published material.
// ---------------------------------------------------------------------------

if (withExtraction) {
  const apiKey = process.env.AICREDITS_API_KEY;
  if (!apiKey) {
    console.error('AICREDITS_API_KEY is not set; skipping extraction');
  } else {
    const extractor = new Extractor({
      apiKey,
      ...(process.env.AICREDITS_BASE_URL ? { baseUrl: process.env.AICREDITS_BASE_URL } : {}),
      ...(process.env.EXTRACTION_MODEL ? { model: process.env.EXTRACTION_MODEL } : {}),
    });

    const posts = (await listPosts(db, creator.id)).slice(-4);
    for (const post of posts) {
      try {
        const candidates = await extractor.extractClaims({
          title: post.title,
          description: post.description,
        });
        const durable = candidates.filter((c) => c.kind !== 'aside');
        for (const c of durable) facts.push(claimToFact(c, creator.id, post.id));
        console.log(
          `  "${post.title.slice(0, 46)}" -> ${candidates.length} candidate(s), ${durable.length} durable`,
        );
      } catch (e) {
        console.error(`  extraction failed for post ${post.id}: ${String(e)}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Retrieve, the way the Mind would.
// ---------------------------------------------------------------------------

const forBrief = retrieve(facts, {
  creatorId: creator.id,
  intent: 'brief',
  features: ['hook_type:question', 'format:tutorial'],
  limit: 6,
});

console.log('\n--- what the Mind would be handed before writing a brief ---\n');
console.log(formatForMind(forBrief));

console.log('\n--- ranking rationale ---');
for (const r of forBrief) {
  console.log(`  ${r.score.toFixed(2)}  ${r.why}`);
}

await mkdir('.data', { recursive: true });
await writeFile('.data/memory-graph.json', JSON.stringify(facts, null, 2));

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const checks: Array<[string, boolean]> = [
  ['beliefs were consolidated', beliefs.length > 0],
  ['every fact validates', invalid === 0],
  ['every semantic fact cites its evidence', facts.every((f) => f.provenance.derivedFrom.length > 0)],
  ['retrieval returned something relevant', forBrief.length > 0],
  [
    'retrieval prefers measured facts for a brief',
    forBrief.length === 0 || forBrief[0]!.fact.provenance.producer === 'posterior',
  ],
];

console.log('');
let ok = true;
for (const [name, pass] of checks) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}`);
  if (!pass) ok = false;
}

console.log(`\n${facts.length} facts written to .data/memory-graph.json`);
if (!ok) {
  console.error('\nMEMORY BUILD FAILED');
  process.exit(1);
}
console.log('MEMORY BUILD PASSED');
