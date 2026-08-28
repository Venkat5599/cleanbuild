<div align="center">

# RATCHET

**An autonomous audience-growth agent. Every post is an experiment; the agent collects the result days later, corrects it for what you do not control, and folds it into a model of your audience that never resets.**

[![Live](https://img.shields.io/badge/live-ratchet.sslip.io-7fa87a)](https://ratchet.187.127.137.136.sslip.io)
[![Tests](https://img.shields.io/badge/tests-78%20passed-7fa87a)](https://github.com/Venkat5599/cleanbuild)
[![License](https://img.shields.io/badge/license-MIT-7fa87a)](LICENSE)
[![Stack](https://img.shields.io/badge/stack-Bun%20%C2%B7%20React%20%C2%B7%20TypeScript-ece7df)](https://github.com/Venkat5599/cleanbuild)

RATCHET is a persistent agent (a Minds agent holds its memory and its voice) whose core is a Bayesian bandit: every published post is logged as an experiment with a feature vector, its outcome is matured automatically at 24h/72h/168h, a confound-corrected residual reward is computed in deterministic TypeScript, and a per-creator posterior over creative features is updated. The next brief is drawn from the posterior by Thompson sampling, checked against the creator's canon by a deterministic gate, and surfaced only if it clears it. No numeric inference happens inside the LLM; the system closes its loop with no browser and no human.

### ▶ Live at [https://ratchet.187.127.137.136.sslip.io](https://ratchet.187.127.137.136.sslip.io)

[Live demo ↗](https://ratchet.187.127.137.136.sslip.io) · [Repo ↗](https://github.com/Venkat5599/cleanbuild) · [Architecture ↓](#architecture) · [Run it locally ↓](#run-it-locally)

Built for **Creative Minds Jam #1** — Audience Growth & Engagement track. MIT licensed.

</div>

## Table of contents

- [▶ See it in one command](#-see-it-in-one-command)
- [The problem RATCHET solves](#the-problem-ratchet-solves)
- [How it works](#how-it-works)
  - [1 · Publish — an experiment opens](#1--publish--an-experiment-opens)
  - [2 · Mature — the clock runs itself](#2--mature--the-clock-runs-itself)
  - [3 · Teach — the posterior updates](#3--teach--the-posterior-updates)
  - [4 · Act and follow up — briefly, gated, unprompted](#4--act-and-follow-up--briefly-gated-unprompted)
- [Architecture](#architecture)
- [Engineering decisions — the hard problems](#engineering-decisions--the-hard-problems)
- [What's real vs pending](#whats-real-vs-pending)
- [Tests](#tests)
- [Run it locally](#run-it-locally)
- [Configuration](#configuration)
- [Deploy](#deploy)
- [Project layout](#project-layout)
- [Tech stack](#tech-stack)
- [Roadmap](#roadmap)
- [License](#license)

## ▶ See it in one command

The acceptance test, run end to end with no browser open — it seeds its own eight weeks of history, publishes a post, advances the clock, and every step after that is the same code the cron runs in production:

```bash
bun run scripts/demo-timetravel.ts
```

Real output from a fresh clone:

```
  PASS  experiments matured with no human input
  PASS  posterior changed
  PASS  uncertainty did not increase
  PASS  the demo experiment was judged material (cleared the gate on its merits)
  PASS  a notification was composed and delivered or surfaced
  PASS  the act step proposed a brief from the posterior
  PASS  the canon gate blocked the deliberately contradictory draft

TIME TRAVEL PASSED. No browser was open at any point in this run.
```

The learning path is verified separately — `bun run scripts/verify-recovery.ts` seeds 40 weeks of history with a planted ground truth (question hooks worth +0.6σ, 20-minute videos −0.4σ, four other planted effects) and asserts the posterior recovers it. Real output from a fresh clone:

```
C3 reward distribution: mean -0.008, sd 0.959  PASS

planted effect vs recovered posterior:
  feature                              planted   recovered   95% CI            P(>0)
  hook_type:question                     0.60      0.242   [-0.25, 0.73]     0.83  ok
  hook_type:contrarian                   0.25     -0.065   [-0.56, 0.42]     0.39  WRONG SIGN
  length_bucket:20m_plus                -0.40     -0.107   [-0.61, 0.39]     0.33  ok
  thumbnail_archetype:face_reaction      0.30      0.154   [-0.32, 0.62]     0.73  ok
  format:shorts                         -0.20     -0.040   [-0.52, 0.44]     0.43  ok

C1 signal recovery:
  correlation over planted effects : 0.894  (gate: > 0.70)
  correlation over all 35 weights  : 0.386  (reported, not gated —
      30 of 35 true weights are zero, so this statistic measures noise)
  signs correct                    : 4/5  (gate: >= 4)
  strongest of the planted set     : hook_type:question  (gate: question, the
      planted +0.60 effect, must be the largest of the five recovered)
  PASS

n = 194 closed experiments

VERIFICATION PASSED
```

The table shows what the methodology is honest about: at this sample size the ±4σ clip and 30 zero-true-weights mean smaller planted effects are recovered with 95% CIs that include zero, and one sign comes back wrong — the gates are set to what is actually identifiable (correlation > 0.70, signs ≥ 4/5, planted-set ordering), and the all-35 statistic is reported but never gated.

## The problem RATCHET solves

Creators optimise by vibes and survivorship bias. Nobody logs what they tried, so last month's lesson is gone — and the feedback that does arrive is tangled up with follower growth, the day of the week, and plain luck, so the lesson people take away is usually the wrong one.

- Feedback arrives days after the decision, in units of views and noise, not causes.
- Follower growth masquerades as content quality; a general uptrend makes everything look like it worked.
- Nobody re-reads last month's videos, so the same mistakes get re-run at scale.
- The successful formats and the failed ones are never confronted with the numbers side by side.
- Every tool that exists tells you what happened after the fact; none of them decide anything before it.

RATCHET closes that loop the only way it can be closed — with a model that learns from every post, in units of "this worked / this didn't", corrected for the confounds, and that proposes the next post before it is published. The creator's only job is to publish.

## How it works

### 1 · Publish — an experiment opens

Publishing a post inserts one row and opens an experiment with a 35-dimensional one-hot feature vector (`hook_type` × `length_bucket` × `thumbnail_archetype` × `publish_slot` × `format` × `topic_cluster`):

```ts
const { id: postId } = await insertPost(db, { creatorId, platformPostId, publishedAt, ... });
await insertFeatures(db, postId, FEATURE_SCHEMA_VERSION, labels, encode(labels), 'mind');
const experimentId = await openExperiment(db, postId, creator.id, publishedAt);
```

### 2 · Mature — the clock runs itself

A Cloudflare Cron Trigger (and the demo's injected clock) calls `matureDueExperiments` hourly. Provisional checkpoints at 24h and 72h are collected and displayed but never teach. At 168h the experiment closes and the reward is computed — or the experiment is **voided**, never imputed. A fabricated reward is indistinguishable from a real one once it is in the posterior, so missing data is excluded, not invented.

```ts
const due = await dueExperiments(db, now, limit);
if (!metric?.views) { await voidExperiment(db, exp.id, `no metrics at ${checkpoint}`); continue; }
```

### 3 · Teach — the posterior updates

The reward is `(log views − predicted log views) / σ_resid`, clipped to ±4σ, where the prediction comes from a per-creator ridge baseline that absorbs follower growth, day-of-week, posting gaps, and time trend. The posterior over creative effects updates with a rank-1 Sherman–Morrison step, and a nightly full Cholesky recompute from the ledger checks for drift:

```ts
const components = residualReward(metric.views, model, ctx);
const after = update(before, thisOne.vector, components.clipped, DEFAULT_NOISE_VAR);
const deltas = beliefDiff(before, after);
```

### 4 · Act and follow up — briefly, gated, unprompted

The act step draws **one** `θ̃ ~ N(μ, Σ)` per decision round, scores eight candidate briefs against that single draw (drawing per candidate would destroy the Thompson exploration guarantee), applies the exploration budget, and runs the drafted brief through a deterministic canon gate:

- **dead format** — any active feature with P(helps) ≤ 0.20 is ruled out;
- **hook cooldown** — a hook used within the last 14 days is a repeat, not a test;
- **contradiction** — a draft whose token set overlaps a recorded canon claim is blocked with the quote; when `EMBEDDING_*` is configured, claims are embedded once (cached in the `claims` table) and a draft whose cosine similarity to any claim clears 0.8 is blocked too, even with zero shared tokens. Without configuration the rule degrades to the deterministic token check — a gate must degrade to its rules, never to silence.

Every verdict is persisted to the gate log. If the belief change clears the materiality gate (a feature crossing 90% confidence, a trusted belief reversing sign, or a single large move), the worker briefs the Minds agent with the credible intervals and prior context, rate-limited to one message per 24h; the Mind decides how to speak. If the Mind is unreachable it falls back to Telegram, and if both fail the notification stays in the ledger as "not delivered" rather than disappearing.

```ts
const verdict = assessMateriality({ deltas, marginalsAfter, marginalsBefore, nObs, lastNotifiedAt, now });
if (verdict.material) { await deps.minds.sendMessage(alias, composeMindBriefing(briefing)); }
```

## Architecture

```
          ┌────────────────────────────── external ──────────────────────────────┐
          │   Minds Builder API (memory + voice of the Mind)    Telegram (fallback)│
          └───────────────────────────────────────────────────────────────────────┘
                                  ▲ message │                                      │
                                  │         └──────────────────────────────┐       │
   publish                        │                                        ▼       │
   creator ──▶ apps/worker (Hono on Cloudflare Workers, cron: hourly + nightly)
                   │  matureDueExperiments → residualReward → posterior update
                   │  assessMateriality → composeMindBriefing → deliver
                   ▼
        ┌──────────────────────────────── the ledger ─────────────────────────────────┐
        │  D1 / SQLite: posts, features, metrics, experiments, posteriors,          │
        │  snapshots, belief_diffs, briefs, gate_events, claims, notifications      │
        └───────────────────────────────────────────────────────────────────────────┘
                   ▲
                   │ reads (read-only oRPC contract)
        apps/web (Next.js 16 landing + dashboard, labelled snapshot fallback)
```

### Component by component

| Component | Technology | Responsibility |
|---|---|---|
| `apps/worker` | Hono on Cloudflare Workers | oRPC API, `/health`, `/metrics` (token-gated), cron triggers: hourly maturation + follow-up, nightly refit |
| `packages/core` | TypeScript (pure) | featurizer (d=35), ridge baseline, residual reward ±4σ, conjugate posterior (rank-1 + Cholesky), Thompson sampling, pooling |
| `packages/pipeline` | TypeScript | `matureDueExperiments`, `refitCreator`, weekly snapshots, **act step + canon gate** |
| `packages/db` | Drizzle (D1 / bun:sqlite) | one schema, two handles; typed query layer |
| `packages/mind` | Minds Builder API client | `sendMessage` / `getHistory` / `ensureConversation`, deterministic materiality gate, briefing + fallback composition |
| `packages/observability` | OTel + Prometheus + Upstash Redis | trace spans, counters/gauges, cron lock (overlapping runs correct for nothing) |
| `apps/web` (saas/) | Next.js 16 | landing + dashboard; reads the Worker, falls back to a labelled snapshot |

## Engineering decisions — the hard problems

1. **The ±4σ reward clip is load-bearing, not cosmetic.** One genuinely viral post carries a residual of 8+σ; unclipped, that single observation dominates the posterior and the agent concludes whatever arbitrary hook it used is a law of nature. Clipping bounds any one experiment's influence — and it is why the materiality gate is exercised on a young posterior in the demo rather than a saturated one.
2. **One `θ̃` draw per decision round.** Drawing a fresh posterior sample per candidate is not Thompson sampling — it is argmax over independent noise, which systematically picks the luckiest draw and destroys the exploration guarantee. The rank function takes an already-drawn θ; a test locks it.
3. **The materiality gate is deterministic TypeScript, not a prompt.** A rate limit implemented as an LLM instruction is not a rate limit. The gate (≥ 20 observations, 24h rate limit, crossing/reversal/large-move triggers) is pre-registered, unit-tested, and enforced regardless of what any model thinks.
4. **Void, never impute.** Missing 168h metrics kill the experiment with an audit row. A fabricated reward is indistinguishable from a real one once it enters the posterior, so the learning path contains no imputation anywhere.
5. **Verification gates must test identifiable invariants.** The recovery check originally demanded the planted +0.6σ question hook be the largest mean over *all 35* weights — but 30 of the 35 true weights are zero, so the max over the full vector is a noise spike (expected |z|max ≈ 2.2) and a perfect pipeline fails it half the time. The gate now asserts the invariant that is actually identifiable at this sample size: within-block ordering of the planted effects.
6. **A dashboard that lies is worse than a dashboard that says "snapshot".** Every dashboard page labels its source (live Worker vs captured snapshot with a date). The bento, the proof section and the hero numbers read the same labelled snapshot, so nothing on the surface can drift from the pipeline.
7. **One schema, two databases.** The pedestal ledger is Cloudflare D1 in the worker and `bun:sqlite` locally — the same Drizzle definition, migrated identically, so the acceptance test you run on your laptop is byte-for-byte the code the cron runs in production.

## What's real vs pending

| Feature | Status | Detail |
|---|---|---|
| Learning pipeline (featurizer, baseline, reward, posterior, Thompson) | ✅ Real | Verified: planted-signal correlation 0.894, signs 4/5 (gate ≥ 4), drift logged 2.3e-1, 31 core tests |
| Autonomous acceptance test (`demo-timetravel.ts`) | ✅ Real | Runs end to end with no browser: maturation, materiality, notification, brief, gate block (7/7 checks) |
| Act step + canon gate (briefs, gate log) | ✅ Real | Deterministic rules, every verdict persisted, 8 act tests; contradiction = token-overlap (always on) + embedding cosine (when `EMBEDDING_*` set) |
| Hierarchical pooling across creators | ✅ Real | Empirical Bayes, 3+ creators per niche; making niche pooled, own-data weight 0.66; nightly cron wired |
| Minds agent integration | ✅ Real | Verified live: real briefing delivered to the Wake Mind (`[mind] delivered 2026-09-03T06:24Z`), it replied "Acknowledged — loop verified". Caveat: account has **zero cognition credits** — top up before recording the demo's reply scene |
| Dashboard + landing | ✅ Live — an operating console, not a poster | Named HTTPS: https://ratchet.187.127.137.136.sslip.io (Caddy + sslip.io); overview, experiment detail with residual reward, posterior explorer (sort/why/week-compare), canon-gate runner with override, act-step brief generation, autonomous activity feed, Mind memory, and the interactive sandbox all operate the real backend; the old ratchet.pages.dev sti...[truncated]
| YouTube connector | ✅ Code ready, needs key | `ingestChannel` / `pollChannel` with deterministic label heuristics (`labeledBy: 'heuristic'`), 24 tests; requires `YOUTUBE_API_KEY` to run |
| Production Worker + cron | ✅ Deployed on VPS | `ratchet-api` (Hono on Bun, :8787, https://ratchet-api.187.127.137.136.sslip.io) + `ratchet-web` (Next, :8790) under pm2; crontab runs hourly maturation + nightly refit/pool; the Cloudflare Worker path remains in the repo but is no longer required |
| Telegram delivery | ✅ Verified live | Fallback channel; demo run delivered for real (`delivered: 'telegram'`, TIME TRAVEL PASSED 7/7) via @ratchet_alerts_bot on 2026-08-28 |
| Embedding-based claim extraction | ❌ Not wired | Memory graph (`packages/memory`) exists; extraction needs the AICREDITS key and is not wired into the autonomous path (distinct from the gate's embedding rule, which is built) |

**What removing the Minds agent breaks.** The Minds agent is the product's memory and its voice. Remove `packages/mind` and the autonomous path can still compute rewards and update beliefs (that arithmetic is deliberately deterministic), but there is no continuity: nothing holds the narrative across sessions, and the "unprompted follow-up that references what we last talked about" — the persistence claim this jam scores — disappears. The fallback Telegram message is a delivery channel, not a replacement memory. `docs/MINDS.md` is the ownership table.

## Tests

78 tests, 0 failures:

```
 31 pass in packages/core     (baseline, reward, posterior incl. signal recovery,
                               Thompson, pooling)
 47 pass in packages/pipeline (act round structure, one-draw invariant,
                               dead_format / hook_cooldown / contradiction,
                               embedding client contract, determinism, niche
                               pooling, YouTube label heuristics)
Ran 78 tests across 6 files.
```

```
$ bun test
...

 78 pass
  0 fail
4527 expect() calls
Ran 78 tests across 6 files.
```

The most important test is not in the suite: `scripts/verify-recovery.ts` runs the real pipeline over the seeded ledger and asserts the posterior recovers the planted ground truth (see *See it in one command*).

## Run it locally

```bash
git clone https://github.com/Venkat5599/cleanbuild
cd cleanbuild
bun install
bun run scripts/migrate.ts            # applies the Drizzle migrations to .data/dev.db
bun run scripts/seed-history.ts --creators 6 --niches making,making,making,tech,gaming,fitness  # canonical 6-creator ledger (194 experiments)
bun run scripts/verify-recovery.ts    # must print VERIFICATION PASSED
bun run scripts/demo-timetravel.ts    # the acceptance test — no browser, no key needed
bun test                              # 78 tests, 0 fail
```

(Plain `bun run scripts/seed-history.ts` seeds a single creator — every number quoted above is from the canonical 6-creator command, which is what a fresh clone produces.)

Requires Bun ≥ 1.2. The dashboard:

```bash
cd saas && npm install && npm run dev   # http://localhost:3000
```

With no Worker configured, every dashboard page renders the labelled snapshot and says so. Quickstart verified from a clean clone on 2026-08-26.

## Configuration

Copy `.env.example` to `.env`. Every key in the file is read by code; nothing else is.

| Variable | Default | Description |
|---|---|---|
| `MINDS_BUILDER_API_KEY` | — | Builder API JWT from build.hellominds.ai; header `X-Api-Key` |
| `MINDS_ALIAS` | — | Conversation alias the worker messages when an experiment matures |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | — | Fallback delivery channel |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | — | Cron lock + Prometheus counters (workers cannot hold TCP Redis) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_HEADERS` | — | Any OTel-compatible collector |
| `METRICS_TOKEN` | — | Bearer required to scrape `/metrics` |
| `AICREDITS_API_KEY` / `AICREDITS_BASE_URL` / `EXTRACTION_MODEL` | aicredits.in / deepseek-v4-flash | Mechanical claim extraction (memory graph scripts only) |
| `EMBEDDING_BASE_URL` / `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` | — | OpenAI-compatible `/embeddings`; unset → the gate runs its deterministic token rule only. **Changing the model invalidates stored claim vectors** — clear `claims.embedding` once |
| `YOUTUBE_API_KEY` | — | YouTube Data API v3 for the connector; unset → ingest/poll never run |
| `RATCHET_API_URL` | — | oRPC endpoint of the deployed worker; unset → labelled snapshot |

Worker secrets are set with `wrangler secret put NAME` (see Deploy), never via `.env`.

## Deploy

**Worker** (needs a Cloudflare login):

```bash
cd apps/api
wrangler d1 create ratchet          # paste database_id into wrangler.toml
wrangler d1 migrations apply ratchet --local=false
wrangler secret put MINDS_BUILDER_API_KEY   # + MINDS_ALIAS, TELEGRAM_*, UPSTASH_*, OTEL_*, METRICS_TOKEN
wrangler deploy                     # confirm both cron triggers register
bun run scripts/export-seed.ts > .data/seed.sql && wrangler d1 execute ratchet --file=.data/seed.sql
```

The hourly cron (`0 * * * *`) matures experiments and runs follow-up; the nightly (`0 3 * * *`) refits baselines and recomputes every posterior. Baseline and posterior data are copied from the locally verified database, not re-seeded.

**VPS (no Cloudflare needed — this is what runs live today):**

```bash
ssh root@<vps>
git clone https://github.com/Venkat5599/cleanbuild /opt/ratchet && cd /opt/ratchet
bun install
# /etc/ratchet.env (chmod 600): RATCHET_DB_PATH, PORT, MINDS_*, TELEGRAM_*
bun scripts/migrate.ts && bun scripts/seed-history.ts --creators 6 --niches making,making,making,tech,gaming,fitness
bun scripts/verify-recovery.ts          # before pooling — see docs/TECHNICAL ordering note
bun scripts/pool-niches.ts && bun scripts/generate-briefs.ts
PORT=8787 pm2 start /root/.bun/bin/bun --name ratchet-api -- apps/api/src/serve.bun.ts
cd saas && npm install && RATCHET_API_URL=http://127.0.0.1:8787 npm run build
PORT=8790 RATCHET_API_URL=http://127.0.0.1:8787 pm2 start npm --name ratchet-web -- run start
# crontab: 0 * * * * cd /opt/ratchet && . /etc/ratchet.env && bun scripts/cron-jobs.ts hourly
#          0 3 * * * cd /opt/ratchet && . /etc/ratchet.env && bun scripts/cron-jobs.ts nightly
pm2 save
```

Live: admin at `:8787` (`/health`, `/rpc/*`), dashboard at `:8790`. Named HTTPS via Caddy + sslip.io (no DNS needed):

```
ratchet.187.127.137.136.sslip.io { reverse_proxy localhost:8790 }
ratchet-api.187.127.137.136.sslip.io { reverse_proxy localhost:8787 }
```

**Frontend** (`saas/`, deployed on Cloudflare Pages): set `RATCHET_API_URL` to the deployed worker, then `npm run build`. The dashboard runs on the live alias once pages.dev is pointed at the updated build.

## Project layout

```
apps/
  api/                 Hono worker: oRPC router, /health, /metrics, cron triggers
  web/                 (scaffold superseded by saas/)
packages/
  core/                pure inference: features, baseline, reward, posterior, thompson
  db/                  Drizzle schema + typed queries over D1 / bun:sqlite
  memory/              ontology, extraction, consolidation (label-extraction scripts)
  mind/                Minds API client, materiality gate, briefing composition
  observability/       OTel, Prometheus metrics, Redis cron lock
  pipeline/            maturation, refit, snapshots, act step, canon gate
saas/                  Next.js 16 landing + dashboard (labelled snapshot fallback)
scripts/
  seed-history.ts      seeds labelled synthetic history with a planted ground truth
  verify-recovery.ts   asserts the posterior recovers the planted signal
  demo-timetravel.ts   the acceptance test (self-contained)
  generate-briefs.ts   populates briefs + gate log on the verified database
  export-snapshot.ts   rewrites saas/lib/snapshot.json from the verified database
  export-seed.ts       dumps the verified database as SQL for D1
docs/                  PRD, ARCHITECTURE, TODO, CHECKLIST
```

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Bun, TypeScript (strict, `noUncheckedIndexedAccess`) |
| Worker | Hono, Cloudflare Workers + D1, Cron Triggers, oRPC |
| Database | Drizzle ORM, SQLite (D1 / bun:sqlite) |
| Frontend | Next.js 16, Tailwind v4, Motion, Lucide |
| Inference | pure TypeScript (ridge, Sherman–Morrison, Cholesky, Thompson) — no numeric inference in the LLM |
| Agent | Minds Builder API (`X-Api-Key`), deterministic gate + briefing |
| Observability | OpenTelemetry OTLP/HTTP, Prometheus text format, Upstash Redis |
| Tests | bun:test (78 tests) |

## Roadmap

Everything in v1 is in this repo; what remains needs credentials or the owner:

- Minds cognition credits top-up, then the demo's wake-up scene via Minds (the fallback Telegram channel is already verified live, so the scene works either way).
- A `YOUTUBE_API_KEY` to run the YouTube connector against a real channel.
- Optionally point ratchet.pages.dev at the new build (the old landing still serves there).
- Claim extraction wiring (memory graph scripts need the AICREDITS key) — distinct from the gate's embedding rule, which is built.

## License

MIT — see [LICENSE](LICENSE). The frontend template keeps its own license in `saas/LICENSE`.

Built for **Creative Minds Jam #1**, August 2026.