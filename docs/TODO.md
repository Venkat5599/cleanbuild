# RATCHET — Build TODO

**Deadline** 2026-08-28 23:59 HKT · **Today** 2026-08-22 · **Days remaining** 6 (buffer: 1)
Companion to `docs/PRD.md` and `docs/ARCHITECTURE.md`.

Legend: `[ ]` open · `[x]` done · `[~]` in progress · `[!]` blocked · **P0** = never cut

---

## D0 — Pre-flight (do before writing any feature code, ~2h)

- [ ] **P0** T-000 Read hellominds.ai docs. Write `docs/MINDS_NOTES.md` with the real memory API shape (create/read/append/namespace), rate limits, auth. *Everything downstream depends on this.*
- [ ] **P0** T-001 Create Minds agent, confirm a memory write survives a session boundary. Smallest possible test: write a fact, kill session, new session, read it back.
- [ ] T-002 Register for a cognition boost (jam offers one per team).
- [ ] **P0** T-003 Provision Neon project + branch `dev`. Save connection string to `.env`.
- [x] T-004 `bun init` monorepo, workspaces: `apps/web`, `apps/worker`, `packages/{core,mind,db,connectors}`.
- [ ] T-005 Google Cloud project, enable YouTube Data API v3, OAuth consent screen, client id/secret.
- [ ] T-006 Telegram bot via BotFather, save token + your chat id.
- [ ] T-007 Git repo + initial commit. Public repo is a submission requirement.
- [ ] T-008 `.env.example` with every key from ARCHITECTURE §10 and §11.

**Exit gate D0:** a Minds memory write survives a session boundary, and `psql` connects to Neon.
Do not proceed until both are true.

---

## D1 — 22 Aug · Data spine

- [ ] **P0** T-100 `packages/db`: schema from PRD §9. Migrations. Enable `pgvector`.
- [ ] T-101 Typed query layer (no ORM needed at this size — hand-written typed queries are fine).
- [ ] **P0** T-102 `packages/connectors/youtube.ts`: channel fetch, video list, per-video stats.
- [ ] T-103 `packages/connectors/csv.ts`: import path with column validation (ARCHITECTURE §11).
- [ ] **P0** T-104 `packages/mind`: memory contract wrapper — 4 regions (`identity`, `canon`, `beliefs`, `decisions`) with the write policies from ARCHITECTURE §5.
- [ ] **P0** T-105 `scripts/seed-history.ts`: 8 weeks of shaped history. Plant a known signal (e.g. `question` hooks worth +0.6 sigma, `20m_plus` worth −0.4) so posterior recovery is verifiable.
- [ ] T-106 Idempotency: `(creator_id, platform_post_id)` unique constraint, re-poll test.
- [ ] T-107 `clock.ts` injectable clock in `apps/worker`. Time-travel depends on this — build it now, not later.

**Exit gate D1:** 8 weeks of seeded history queryable; `mind.write` / `mind.read` round-trips.

---

## D2 — 23 Aug · Reward pipeline

- [x] **P0** T-200 `core/featurizer.ts`: 6 dimensions → one-hot `d=35` vector (PRD §8.1).
- [ ] **P0** T-201 `mind.label(post)` — hook_type / thumbnail_archetype / topic_cluster. Write label to `features` AND to `canon` memory. Immutable per `schema_version`.
- [ ] T-202 Topic clustering: k=8 per creator over title+description embeddings.
- [x] **P0** T-203 `core/baseline.ts`: weighted ridge, half-life 90d, returns `{coefs, sigmaResid, nTrain}`.
- [x] **P0** T-204 `core/reward.ts`: residual z-score with ±4σ clip.
- [ ] T-205 Experiment lifecycle: open on new post, checkpoints stamped at t+24/72/168h.
- [x] T-206 Unit tests for `core/baseline` + `core/reward` (pure, no I/O).

**Exit gate D2:** every seeded post has a reward; distribution is roughly mean 0, sd 1.
If it is not, the baseline model is wrong — stop and fix before D3.

---

## D3 — 24 Aug · The brain

- [x] **P0** T-300 `core/posterior.ts`: `initFromPrior`, `update` (Sherman–Morrison), `recompute` (Cholesky), `marginal`, `probPositive`.
- [x] **P0** T-301 Serialise `mu` / `Sigma` to `bytea`, round-trip test.
- [x] **P0** T-302 `core/thompson.ts`: `sampleTheta` (seeded RNG), `rank`, `predictiveVariance`.
- [x] **P0** T-303 **Recovery test** — run the posterior over seeded history, assert it recovers the planted signal from T-105 within tolerance. *This is the single most important test in the repo.*
- [x] T-304 Property tests: variance monotonically non-increasing; `tau2→0` stays at prior; clipping bounds single-experiment influence.
- [ ] **P0** T-305 `mind.generateCandidates(ctx, k=8)` — briefs consistent with canon.
- [ ] **P0** T-306 Act loop: ONE `theta_tilde` draw per decision round (not per candidate — this is the correctness bug that silently breaks Thompson sampling), rank, flag exploratory by `x'Σx > p75`.
- [ ] **P0** T-307 `mind.decidePolicy` — exploration budget enforcement, rationale written to `decisions` memory.
- [ ] T-308 `belief_diffs` writer: which weights moved, by how much, caused by which experiment.

**Exit gate D3:** T-303 passes. Posterior recovers planted signal. Briefs generate with credible intervals.

---

## D4 — 25 Aug · CRITICAL PATH · Autonomy

> If this day's exit gate fails, execute the PRD §12 cut order **immediately**, not on D6.

- [ ] **P0** T-400 `apps/worker/jobs/mature.ts` — hourly scan, fetch metrics, close at 168h, update posterior, write belief diff.
- [ ] **P0** T-401 `apps/worker/jobs/notify.ts` + `mind.evaluateNotification` — materiality threshold, 1/24h rate limit.
- [ ] **P0** T-402 Telegram dispatch. Message references prior context by name ("the three you launched Tuesday").
- [ ] T-403 `jobs/refit.ts` nightly baseline + full posterior recompute; log incremental-vs-recompute divergence as a health metric.
- [ ] T-404 Canon Gate: claim extraction → embeddings → cosine top-k → `mind.adjudicateClaim`.
- [ ] T-405 Gate rules: hook cooldown (14d), dead format (`P(θ<0) ≥ 0.8`), contradiction. Write `gate_events`.
- [ ] **P0** T-406 `scripts/demo-timetravel.ts` — **browser closed**: advance clock → mature experiment → posterior mutates → Telegram arrives. This is the demo *and* the acceptance test.
- [ ] T-407 Failure handling from ARCHITECTURE §8: 429 backoff, missing metrics → `void` not imputed, label failure → retry not guess.

**Exit gate D4:** `bun scripts/demo-timetravel.ts` runs end to end with no browser open and a real
Telegram message lands. **This is the submission.** Everything after is presentation.

---

## D5 — 26 Aug · Surface

- [~] T-500 `core/pooling.ts` empirical Bayes + `jobs/pool.ts` nightly. *Cut #1 if behind → static niche prior JSON.*
- [ ] T-501 Static fallback prior JSON for 12 niches (also the `n_creators < 3` path).
- [ ] T-502 `posterior_snapshots` weekly writer.
- [ ] **P0** T-503 Dashboard `/posterior`: marginal effects, credible intervals, sorted by effect size. Never point estimates.
- [ ] **P0** T-504 Dashboard `/learned`: belief-diff feed in plain language.
- [ ] **P0** T-505 Time-travel view: week-1 vs week-8 side by side. Uncertainty visibly collapses.
- [ ] T-506 Dashboard `/ledger`: experiment table.
- [ ] T-507 Dashboard `/gate`: blocked briefs + explanations.
- [ ] T-508 Shrinkage indicator: "62% your data, 38% niche prior".
- [ ] T-509 Chat surface with continuity opener after simulated silence.
- [ ] T-510 Design pass — follow the anti-slop law. No purple gradients, no eyebrow pills, no icon-in-tile, no filled+outline button pair. Charts: load the `dataviz` skill before writing chart code.

**Exit gate D5:** week-1 vs week-8 renders and visibly differs. Screenshot it immediately as demo insurance.

---

## D6 — 27 Aug · Submission package

- [ ] **P0** T-600 Demo video 110s. Beat sheet:
  - 0-12s problem framing
  - 12-30s post published, experiment #47 opens with its feature vector
  - 30-50s **time skip, no human** — cron fires, posterior updates on screen
  - 50-70s unprompted Telegram arrives
  - 70-90s week-1 vs week-8, uncertainty collapses, Mind explains what it changed its mind about
  - 90-105s Canon Gate blocks a contradictory draft
  - 105-110s "every creator sharpens the prior for the next one"
- [ ] **P0** T-601 README: what it is, the four loops, how to run, `.env.example`, seeded demo instructions.
- [ ] **P0** T-602 `docs/TECHNICAL.md`: the math, written for a judge — residualisation, conjugate update, Thompson sampling, hierarchical pooling.
- [ ] **P0** T-603 `docs/MINDS.md`: explicit ownership table proving the Mind is integral and not removable.
- [ ] T-604 Architecture diagram exported as an image for the README.
- [ ] T-605 Repo hygiene: no secrets committed, LICENSE, clean history. Run a secret scan.
- [ ] T-606 Honest limitations section — small-n caveats, single real connector. Judges reward this.

---

## D7 — 28 Aug · Ship (deadline 23:59 HKT)

- [ ] **P0** T-700 Run full `docs/CHECKLIST.md` top to bottom.
- [ ] **P0** T-701 Fresh-clone test: clone to a new directory, follow the README, confirm it runs.
- [ ] **P0** T-702 Submit before 18:00 HKT. Do not use the last 6 hours.
- [ ] T-703 Tag release `v1.0-jam`.

---

## Parking lot (explicitly NOT v1)

- Multi-platform repurposing · auto-publishing · learned reward weights · thumbnail image model
- Mobile app · billing · team accounts · A/B testing of thumbnails at serve time

## Blockers log

| ID | Blocker | Raised | Owner | Resolution |
|---|---|---|---|---|
| | | | | |
