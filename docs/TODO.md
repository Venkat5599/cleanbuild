# RATCHET — Build TODO (verified state, 2026-08-28)

This is the historical build plan with its **verified** state as of the final
push. A ticket is marked done only when the artifact exists and was exercised
(see the evidence column). Anything marked `blocked/user` is a credential or
action that only the repo owner can supply — the code for it is in place.

Status legend: ✅ verified · 🟡 code done, live check needs a credential · 🔴 open/user · ✂️ cut

## D0 — Pre-flight

| Ticket | Task | State | Evidence |
|---|---|---|---|
| T-000 | Minds API shape (create/read/auth/limits) | ✅ | Live probes + official `@animocabrands/minds-client-lib` dist; endpoint map in `packages/mind/src/client.ts` and `docs/MINDS.md` |
| T-001 | Memory write survives a session boundary | ✅ | Real delivery to the Wake Mind (`[mind] delivered`) and its reply "Acknowledged — loop verified" |
| T-002 | Cognition boost / credit top-up | 🔴 | Wake reported **zero cognition credits** — must top up before the demo's reply scene |
| T-003 | Neon provision | ✂️ | Shipped on Cloudflare D1/SQLite instead (PRD §9 implementation note) |
| T-004 | Monorepo bootstrap | ✅ | Bun + Turborepo, `apps/{api,web}` + `saas` + `packages/{core,db,memory,mind,observability,pipeline}` |
| T-005 | Google Cloud / YouTube key | 🟡 | Connector built (`packages/pipeline/src/youtube.ts`, `scripts/import-youtube.ts`) and unit-tested; `YOUTUBE_API_KEY` not provisioned |
| T-006 | Telegram bot token | 🟡 | `TELEGRAM_BOT_TOKEN` present in the operator environment; ownership not yet verified via `getMe` |
| T-007 | Public git repo | ✅ | `github.com/Venkat5599/cleanbuild`, main branch, pushed |
| T-008 | `.env.example` | ✅ | True grep-verified contract; dead vars dropped |

## D1 — Data spine

| Ticket | Task | State | Evidence |
|---|---|---|---|
| T-100 | Schema + migrations | ✅ | `packages/db`, drizzle, D1 + local SQLite; `drizzle-kit` reports clean |
| T-101 | Typed query layer | ✅ | `packages/db/src/queries.ts` |
| T-102 | YouTube connector | ✅ | `ingestChannel` / `pollChannel`; label heuristics unit-tested (`test/youtube.test.ts`) |
| T-103 | CSV import | ✂️ | Out of scope; the connector surface (`insertPost`/`openExperiment`) is format-agnostic |
| T-104 | Mind memory contract | ✅ | 4-region design; verified live endpoints (humans-scoped list, singular messaging) |
| T-105 | Seeded history with planted signal | ✅ | `scripts/seed-history.ts` — 40-week ledger, planted +0.60 question hook, multi-creator (`--creators`, `--niches`) |
| T-106 | Idempotency | ✅ | `(creator_id, platform_post_id)` guard on `insertPost`; feature labels frozen per `schema_version` |
| T-107 | Injectable clock | ✅ | `systemClock` / `fixedClock` in `packages/pipeline`; time-travel runs on it |

## D2 — Reward pipeline

| Ticket | Task | State | Evidence |
|---|---|---|---|
| T-200 | 6-dim → d=35 featurizer | ✅ | `packages/core/src/features.ts` |
| T-201 | Label posts into canon | ✅ | Heuristic (`labeledBy: 'heuristic'`) + Mind paths; claims table with embeddings |
| T-202 | Topic clustering k=8 | ✂️ | `topicCluster` retained as a learned slot (fixed at 0 for heuristics); not in v1 |
| T-203 | Weighted ridge baseline | ✅ | `core/baseline.ts`, half-life 90d |
| T-204 | Residual z-score ±4σ clip | ✅ | `core/reward.ts` |
| T-205 | Experiment lifecycle | ✅ | Open on post, checkpoints t+24/72/168h, close at 168h |
| T-206 | Baseline/reward tests | ✅ | Pure, no I/O |

## D3 — The brain

| Ticket | Task | State | Evidence |
|---|---|---|---|
| T-300 | Posterior (Sherman–Morrison, Cholesky recompute) | ✅ | `core/posterior.ts`, `marginal`, `probPositive` |
| T-301 | Serialise mu/Sigma | ✅ | float32 blobs, round-trip via `toBlob`/`fromBlob` |
| T-302 | Thompson sampling primitives | ✅ | `sampleTheta` (seeded), predictive variance |
| T-303 | **Recovery test** | ✅ | `scripts/verify-recovery.ts` — VERIFICATION PASSED, recovered correlation 0.979, signs 5/5, drift 3.6e-16 |
| T-304 | Property tests | ✅ | `test/posterior.test.ts` — variance monotone, tau²→0 stays prior, clip bounds influence |
| T-305 | Candidate generation k=8 | ✅ | `ROUND_CANDIDATES=8` in `act.ts` |
| T-306 | ACT: one θ draw per round | ✅ | C2 invariant, tested (`test/act.test.ts`) |
| T-307 | Exploration budget + rationale | ✅ | Budget 0.25; rationale writes the deciding features |
| T-308 | belief_diffs writer | ✅ | `learn.ts`, surfaced on `/learned` |

## D4 — Autonomy

| Ticket | Task | State | Evidence |
|---|---|---|---|
| T-400 | Maturation job, hourly | ✅ | `learn.ts` + nightly cron in `apps/api/src/index.ts` (cron.mature events) |
| T-401 | Materiality gate + 1/24h notify | ✅ | Deterministic materiality (≥0.90 posterior change), rate-limited |
| T-402 | Telegram dispatch | 🟡 | Dispatch path + `notify.ts`; channel `telegram` needs the operator's verified token |
| T-403 | Nightly refit | ✅ | Baseline refit + full posterior recompute on cron |
| T-404 | Canon gate embeddings | ✅ | `embed.ts` + lazy claim-embedding persistence; shape verified against a live OpenAI-compatible endpoint (`{model,input}`); integration-tested with an injected fetch (near-paraphrase blocked at 0.90, far passed 0.00) |
| T-405 | Gate rules + audit | ✅ | dead_format / hook_cooldown / contradiction (token overlap) / embedding; every verdict persisted to `gate_events` |
| T-406 | demo-timetravel acceptance test | ✅ | Self-contained 8-week spec — TIME TRAVEL PASSED 7/7, real Minds delivery with `--deliver` |
| T-407 | Failure handling | ✅ | 429 backoff, missing metrics → void not impute, label failure → retry not guess (see `learn.ts`) |

## D5 — Surface

| Ticket | Task | State | Evidence |
|---|---|---|---|
| T-500 | Empirical Bayes pooling | ✅ | `core/pooling.ts` (TAU2_FLOOR 0.01 ≈ 100 pseudo-obs), `poolNiches`, nightly cron.pool, `pooling.test.ts` |
| T-501 | Thin-niche fallback | ✅ | Stored-prior fallback in `niche_priors` — a thin night never downgrades a pooled prior |
| T-502 | Weekly posterior snapshots | ✅ | `posterior_snapshots`, 39 weeks in snapshot |
| T-503 | /posterior page | ✅ | Marginal effects + credible intervals, sorted |
| T-504 | /learned page | ✅ | Belief-diff feed in plain language |
| T-505 | Time-travel view | ✅ | Week-1 vs week-N, uncertainty collapse visible |
| T-506 | /ledger page | ✅ | Experiment table (100 rows) |
| T-507 | /gate page | ✅ | Blocked briefs + explanations (24 events, 7 blocks) |
| T-508 | Shrinkage indicator | ✅ | "66% your data" — `shrinkageOwn: 0.66` in snapshot, rendered in proof |
| T-509 | Chat surface with continuity | ✅ | Minds follow-up after simulated silence — delivered for real |
| T-510 | Anti-slop design pass | ✅ | Mock logos/testimonials/pricing stripped; real dashboard capture; single dark theme; snapshot-driven numbers |

## D6 — Submission package

| Ticket | Task | State | Evidence |
|---|---|---|---|
| T-600 | Demo video 1.5–2.0 min | 🔴 | User records; needs Minds credit top-up for the reply scene |
| T-601 | README | ✅ | Nendo-format, four loops, track declared, honest limitations, fresh-clone output quoted |
| T-602 | `docs/TECHNICAL.md` | ✅ | Math for judges — see that file |
| T-603 | `docs/MINDS.md` | ✅ | Ownership table — see that file |
| T-604 | Architecture diagram | ✅ | ASCII architecture in README (terminal-first) |
| T-605 | LICENSE + secret scan | ✅ | MIT LICENSE; history scanned post-push (no secrets) |
| T-606 | Honest limitations | ✅ | Small-n caveats, synthetic-history labelling, "not deployed" honesty table |

## D7 — Ship

| Ticket | Task | State | Evidence |
|---|---|---|---|
| T-700 | Full checklist | ✅ | `docs/CHECKLIST.md` refreshed to verified state |
| T-701 | Fresh-clone test | ✅ | Cloned to a clean dir; quickstart verbatim passes; output quoted in README |
| T-702 | Submit | 🔴 | User |
| T-703 | Tag `v1.0-jam` | ✅ | Tagged at final push |

## Blockers log

| ID | Blocker | Owner | Resolution |
|---|---|---|---|
| T-002 | Minds cognition credits = 0 (Wake "will go quiet") | User | Top up at build.hellominds.ai or claim the jam's one-per-team boost |
| T-005 | YouTube API key | User | Optional — connector is env-gated; demo does not need it |
| T-006 | Telegram token ownership | User | Run `getMe` with the token; optional — Minds is the primary channel |
| T-702b | Cloudflare deploy (Worker + D1 + pages.dev) | User | `wrangler login` in repo root; then migrate + seed + deploy (runbook in README) |