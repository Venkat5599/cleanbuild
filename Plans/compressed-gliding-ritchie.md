# RATCHET — remaining work to production

## Context

RATCHET is a Creative Minds Jam #1 submission (Audience Growth track, deadline **2026-08-28
23:59 HKT**). It treats every published post as a formal experiment, autonomously matures the
outcome at 24h/72h/168h, converts raw metrics into a confound-corrected residual reward, and
updates a per-creator Bayesian posterior. The next brief is chosen by Thompson sampling.

**What already works and is pushed** (5 commits on `main`):

- `packages/core` — ridge baseline, residual reward, conjugate posterior (rank-1 + Cholesky),
  Thompson sampling, empirical-Bayes pooling. 31 tests, typecheck clean under strict mode.
- `packages/db` — Drizzle schema over SQLite; one definition, two handles (D1 in a Worker,
  `bun:sqlite` locally).
- `packages/pipeline` — `matureDueExperiments`, `refitCreator`, `backfillSnapshots`.
- `packages/mind` — Minds Builder API client + deterministic materiality gate.
- `packages/observability` — structured events, Redis cron lock.
- `apps/api` — Hono on Workers, `scheduled()` cron, oRPC router, `/admin/run-followup`.
- `scripts/verify-recovery.ts` — passes on 194 closed experiments: rewards centred at -0.008
  sd 0.953, planted-effect correlation 0.934, incremental-vs-recompute drift 0.0.

**What is missing:** the entire frontend, the deployment, the Mind itself, the demo artifact,
and the submission package. Also two observability files written but not yet wired or committed
(`packages/observability/src/otel.ts`, `src/metrics.ts`) plus an uncommitted `apps/web` dep
install.

Intended outcome: a deployed, judge-verifiable product where the autonomous loop can be watched
running with every browser closed.

---

## 1. Finish and wire observability (~30 min)

`otel.ts` and `metrics.ts` exist but nothing calls them.

- `apps/api/src/index.ts`: build a `Tracer` via `tracerFromEnv(env)` in `scheduled()`, wrap the
  follow-up in `tracer.span()`, and `ctx.waitUntil(tracer.flush())`.
- Add `GET /metrics` to the Hono app, guarded by `authorizeMetrics(c.req.header('authorization'),
  env.METRICS_TOKEN)`, rendering `new MetricsStore(redisFromEnv(env)).render()`.
- Increment the counters in `METRICS` from `runFollowUp` results and set
  `ratchet_posterior_drift` from the nightly refit.
- `wrangler.toml`: document `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`,
  `METRICS_TOKEN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` as secrets.
- `pino` in `scripts/*.ts` only. It cannot run in a Worker, and pretending otherwise would be
  a lie in the docs.

**Not doing:** Helm `ServiceMonitor` / `PrometheusRule`. They require a Kubernetes target that
does not exist. Adding them would be decoration, and building a Node runner to justify them
would duplicate the cron path that is the submission's central claim.

## 2. Frontend — `apps/web` (the bulk of the work)

TanStack Start + Vite, deployed to Cloudflare. Talks to the Worker through the oRPC client so
router types are shared and a schema change breaks the build, not the page.

### Design locks (auditable against the anti-slop law)

| Decision | Value | Why |
|---|---|---|
| Theme | Single dark, warm ink `#131210` | Explicitly not the cool blue-charcoal the law names as dark-mode slop |
| Accent | None saturated. Sage `#7fa87a` positive, clay `#b5766a` negative | Colour encodes sign of effect, not decoration. Both desaturated |
| Numerics | Mono | The law permits mono for genuine data. These are genuine data |
| Display type | Self-hosted woff2 in `apps/web/public/fonts` | Not the Google shelf. Fall back to a documented system stack if the download fails, and say so |
| Radius | One scale, sharp (0) throughout | Shape consistency lock |
| Density | High. 1px rules, no card containers | Instrument panel, not a marketing page |

**Signature artifact: the interval field.** Every feature drawn as a horizontal credible-interval
bar on a shared zero axis, with the week-1 posterior as a ghost behind the week-40 solid. It is
built from real data, it is unique to this product, and it *is* the memory proof — the intervals
visibly contract. Everything else on the page supports it.

### Routes

- `/` — the interval field, `nObs`, shrinkage split ("62% your data, 38% niche prior").
- `/ledger` — experiment table: title, date, active features, reward. Mono numerics.
- `/learned` — belief-diff feed in plain language, newest first.
- `/gate` — Canon Gate blocks with explanations.
- `/notifications` — includes undelivered rows, shown as failed.
- `/about` — the landing surface: what it is, the four loops, the honest limitations.

### Rules that must hold

- Credible intervals everywhere. No route may render a bare point estimate.
- Content visible without an entrance animation completing.
- Loading, empty and cold-start states designed, not broken.
- Every interactive control works when clicked, verified with a real pointer.

## 3. Deploy (~45 min, needs your Cloudflare login)

1. `wrangler d1 create ratchet` → paste `database_id` into `apps/api/wrangler.toml`.
2. `bun run --cwd apps/api db:migrate:remote`.
3. `wrangler secret put` for each secret above.
4. `wrangler deploy`, then confirm the cron trigger is registered in the dashboard.
5. Seed production from `scripts/seed-history.ts` pointed at the remote D1.

## 4. The Mind (blocking for the jam requirement)

1. Create the Mind at hellominds.ai, issue a Builder API key at build.hellominds.ai.
2. Verify a memory write survives a session boundary — write a fact, end the session, read it
   back. This was never confirmed and everything about the persistence claim depends on it.
3. Author the RATCHET Skill conversationally per the Skill Building Guide, pointed at the
   deployed Worker.
4. Set `MINDS_BUILDER_API_KEY` and `MINDS_ALIAS`; confirm `/admin/run-followup` reaches the Mind.

## 5. `scripts/demo-timetravel.ts` — the acceptance test

The most important remaining script. With the browser closed: advance the injectable clock,
mature an experiment, mutate the posterior, write a belief diff, deliver a message. It runs the
identical code path as the cron; there is no demo mode.

## 6. Submission package

- `README.md` — what it is, the four loops, setup, seeded-demo instructions, track declaration.
- `docs/TECHNICAL.md` — the math, written for a judge.
- `docs/MINDS.md` — the ownership table proving the Mind is not removable.
- Honest limitations: synthetic seed data labelled as such, one real connector, no auth in v1.
- Demo video, 110s, timed not estimated. Beat sheet is in `docs/TODO.md` T-600.

## 7. Final passes

- Walk the anti-slop design law point by point against the built UI and fix every violation.
- Run `docs/CHECKLIST.md` top to bottom. No open BLOCKER ships.
- Fresh-clone test on the final commit.
- Secret scan across git history, not just HEAD.

---

## Verification

```bash
bun test                          # 31 pass
bunx tsc --noEmit -p tsconfig.json
bun run scripts/migrate.ts
bun run scripts/seed-history.ts
bun run scripts/verify-recovery.ts   # must print VERIFICATION PASSED
bun run scripts/demo-timetravel.ts   # browser closed, message delivered
curl -H "Authorization: Bearer $METRICS_TOKEN" https://<worker>/metrics
```

Frontend is verified in a real browser, not by assertion: click every control, check both the
posterior and time-travel routes render intervals, and confirm content is present with
JavaScript animations disabled.

## Risks

- **The Mind is untested.** Step 4.2 is the one unproven assumption in the whole build. Do it
  before the frontend if time gets tight; a beautiful dashboard with no working Mind fails the
  first judging criterion outright.
- **Cost.** This session is at ~$131. The frontend is the largest remaining spend.
- **Time.** 6 days nominal, but the critical path is the demo artifact, not the UI.

## Order I recommend

Mind verification → demo-timetravel → deploy → frontend → docs → video. If everything after
"deploy" were cut, the submission would still demonstrate memory, continuity and autonomous
follow-up, which is what is actually scored.
