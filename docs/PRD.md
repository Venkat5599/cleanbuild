# RATCHET — Product Requirements Document

**Version** 1.0 · **Date** 2026-08-22 · **Owner** venkat5599
**Event** Creative Minds Jam #1 (Minds by Animoca Brands) · **Track** Audience Growth & Engagement
**Submission deadline** 2026-08-28 23:59 HKT

---

## 1. Summary

RATCHET is a persistent Minds agent that turns a creator's publishing schedule into a
continuously-running experiment program. Every post is logged as a formal experiment with a
feature vector. The agent autonomously collects outcomes 24h / 72h / 168h later, converts raw
metrics into a **confound-corrected residual reward**, and updates a **Bayesian posterior over
creative features** for that specific creator. It then picks the next content brief by Thompson
sampling from that posterior.

The memory is not a transcript. The memory is a fitted statistical model that provably changes
over time and cannot be ported to a competitor.

**Tagline:** *Your audience-growth Mind. It only moves one direction.*

---

## 2. Problem

Creators optimise by vibes and survivorship bias.

| Failure | Detail |
|---|---|
| No experiment record | Nobody logs what they tried. Last month's lesson is gone. |
| Confounded feedback | "Views went up" is entangled with follower growth, day-of-week, seasonality, topic luck. Creators learn the wrong lesson. |
| No exploration policy | Creators either never vary (stagnate) or vary randomly (churn the channel). No principled explore/exploit budget. |
| Cold start | A new creator has no data, so every analytics tool is useless for the first two months. |
| Amnesiac AI tools | Existing AI assistants regenerate from scratch each session. They contradict the creator's past public statements and reuse dead formats. |

Existing tools (vidIQ, Buffer AI, Opus Clip) give descriptive analytics and stateless generation.
None run a per-creator inference loop with a persistent posterior.

**Market signal:** search of the Colosseum builder corpus (5,400+ projects) for
"creator economy audience growth agent memory" and adjacent queries returns max similarity
**0.078**. No incumbent in that dataset.

---

## 3. Goals / Non-goals

### Goals (v1, jam submission)

- G1 — Log every published post as an experiment with a structured feature vector.
- G2 — Autonomously mature experiments on a schedule with zero human prompting.
- G3 — Compute residualised reward that removes follower-growth / timing / topic confounds.
- G4 — Maintain and update a per-creator Bayesian posterior over creative features.
- G5 — Generate the next content brief by Thompson sampling, constrained by an exploration budget.
- G6 — Solve cold start via hierarchical pooling of priors across creators in a niche.
- G7 — Block briefs that contradict the creator's canon (past claims, dead formats, hook cooldown).
- G8 — Prove memory / continuity / autonomy visibly in a 110-second demo.

### Non-goals (v1)

- Multi-platform repurposing / video editing. Out of scope. Different track.
- Auto-publishing on the creator's behalf. Human always presses publish.
- Fine-tuning any model. All learning is closed-form conjugate Bayesian updates.
- Mobile app. Web dashboard only.
- Multi-tenant billing, auth hardening beyond a demo-grade session.

---

## 4. Users

**Primary — the working creator.** 1k–500k followers, publishes 2–7x/week, one main platform,
already looks at analytics but cannot act on them. Wants to know what to make next and why.

**Secondary — the creator's editor or manager.** Reads the ledger, wants defensible reasoning
for creative calls.

---

## 5. Core concepts (domain vocabulary)

| Term | Definition |
|---|---|
| **Experiment** | One published post, with its feature vector `x`, publish time, and a maturation schedule. |
| **Feature vector** | One-hot encoding of the creative choices: hook type, length bucket, thumbnail archetype, publish slot, format, topic cluster. |
| **Baseline model** | Per-creator ridge regression predicting expected `log(views)` from non-creative confounds. |
| **Residual reward** | `r = (log(views_actual) - log(views_hat)) / sigma_resid`. The z-score of the surprise. |
| **Posterior** | Gaussian `N(mu, Sigma)` over feature weights `theta`. The creator's learned model. |
| **Niche prior** | Empirical-Bayes population mean `mu_niche` pooled across creators in the same niche. |
| **Canon** | Persistent ledger of the creator's public claims, running bits, recurring characters. |
| **Canon Gate** | Pre-publish check of a draft brief against the canon and the posterior. |
| **Exploration budget** | Hard cap on the fraction of upcoming posts allowed to be exploratory. |

---

## 6. Functional requirements

### FR-1 Onboarding and cold start

- FR-1.1 Creator connects a YouTube channel (OAuth) or uploads a CSV export.
- FR-1.2 System backfills the creator's full available history, targeting >= 150 posts.
  CORRECTED 2026-08-22: the original target of 40 was statistically impossible.
  With 35 feature weights, 35 closed experiments leaves the posterior at its prior
  (credible intervals +/-0.75 against effects of 0.2-0.6). Measured, not assumed —
  see `scripts/verify-recovery.ts`. Below ~150 posts the product depends on the
  niche prior (FR-9), which is the real answer to cold start.
- FR-1.3 Creator selects a niche from a fixed taxonomy.
- FR-1.4 Posterior initialises from `mu_niche` for that niche, not from zero.
- FR-1.5 Mind writes an onboarding memory entry: who this creator is, niche, cadence, goals.

### FR-2 Featurisation

- FR-2.1 Each post is mapped to a feature vector across 6 dimensions (see 8.1).
- FR-2.2 Hook type, thumbnail archetype and topic cluster are inferred by the Mind from
  title / description / transcript and **written back into memory** so labelling is stable
  across sessions — the same post never gets relabelled differently.
- FR-2.3 Featurisation is versioned. A schema bump invalidates cached labels, not history.

### FR-3 Experiment lifecycle

- FR-3.1 On detection of a new published post, create an experiment row with status `open`.
- FR-3.2 Maturation checkpoints at t+24h, t+72h, t+168h.
- FR-3.3 At t+168h the experiment closes and contributes to the posterior update.
- FR-3.4 Earlier checkpoints produce provisional signals only — displayed, not learned from.

### FR-4 Reward computation

- FR-4.1 Fit or refresh the per-creator baseline ridge model nightly on all closed experiments.
- FR-4.2 Reward = residual z-score of `log(views)` versus baseline prediction.
- FR-4.3 Secondary rewards (retention, comment rate, follower delta) are computed and stored, but
  v1 optimises a single scalar: a weighted blend with fixed weights, exposed in the UI.
- FR-4.4 Rewards are clipped to +/-4 sigma so one viral outlier cannot dominate the posterior.

### FR-5 Posterior update

- FR-5.1 Conjugate Bayesian linear update, closed form (see 8.3). No gradient descent.
- FR-5.2 Update is incremental and idempotent per experiment id.
- FR-5.3 Every update writes a **belief-diff record**: which feature weights moved, by how much,
  and which experiment caused it. This is the audit trail and the demo centrepiece.
- FR-5.4 Posterior snapshots are retained weekly so week-1 versus week-N can be rendered.

### FR-6 Brief generation (the act step)

- FR-6.1 Mind proposes K candidate briefs (K=8) consistent with the creator's canon and upcoming
  topics.
- FR-6.2 Sample `theta_tilde ~ N(mu, Sigma)`, score each candidate `theta_tilde' x`, rank.
- FR-6.3 Enforce the exploration budget: at most `e%` of proposed briefs may sit in a
  high-variance region of feature space. Default `e = 25`.
- FR-6.4 Each brief ships with predicted lift, credible interval, and a plain-language reason
  citing the specific experiments that justify it.
- FR-6.5 Mind writes the chosen brief and its rationale into memory before surfacing it.

### FR-7 Canon Gate

- FR-7.1 Extract claims from every published post. Store with timestamp and source URL.
- FR-7.2 Before a brief is surfaced, embed its claims and cosine-search the claim ledger.
- FR-7.3 Block and explain if: contradiction with a past claim; hook reused inside its cooldown
  window; format whose posterior mean is negative with >= 80% probability.
- FR-7.4 Creator can override a block. The override is recorded as feedback.

### FR-8 Autonomous follow-up

- FR-8.1 A worker runs on a schedule with no human in the loop.
- FR-8.2 On experiment maturation it recomputes, updates, and evaluates a notification policy.
- FR-8.3 Notify (Telegram) only when the Mind judges the belief change material — for example a
  feature crossing 90% probability-of-positive, or a previously-trusted feature being falsified.
- FR-8.4 Notifications are conversational and reference prior context ("the three you launched
  Tuesday"), proving continuity.
- FR-8.5 Rate limit: max 1 proactive message per creator per 24h.

### FR-9 Hierarchical pooling

- FR-9.1 Nightly job re-estimates `mu_niche` and `tau^2` per niche across all creators.
- FR-9.2 A creator's effective prior shrinks toward their own data as evidence accumulates.
- FR-9.3 Shrinkage weight is displayed in the UI ("62% your data, 38% niche prior").

### FR-10 Dashboard

- FR-10.1 Posterior view: per-feature mean and credible interval, sorted by effect size.
- FR-10.2 Time-travel: week-1 versus week-N posterior side by side.
- FR-10.3 Experiment ledger: table of posts, features, reward, contribution.
- FR-10.4 "What the Mind learned this week": belief-diff feed in plain language.
- FR-10.5 Canon Gate log: what was blocked and why.

---

## 7. Minds integration (must be integral — jam requirement)

The Mind is the **policy owner and memory substrate**. Remove it and there is no product.

| Responsibility | Owner |
|---|---|
| Persistent creator state: canon, bits, cadence, goals, posterior summary, experiment ledger index | **Mind memory** |
| Semantic featurisation (hook type, thumbnail archetype, topic cluster) with stable labels | **Mind** |
| Explore-versus-exploit decision and exploration-budget enforcement | **Mind policy** — reads posterior, writes decision and rationale back into its own memory |
| Candidate brief generation constrained by canon | **Mind** |
| Notification worthiness judgement | **Mind** |
| Continuity of conversation across sessions and across days of silence | **Mind memory** |
| Numeric posterior update, ridge fit, matrix algebra | Deterministic TypeScript service, which the Mind reads and writes |

Deliberate split: the Mind owns **judgement and state**, TypeScript owns **arithmetic**.
Arithmetic inside an LLM is a liability. Judgement inside a cron job is impossible.

### Persistence demonstration (explicit jam criteria)

- **Memory** — week-1 posterior versus week-8 posterior rendered side by side; uncertainty
  visibly collapses.
- **Continuity** — creator returns after days of silence; the Mind opens by referencing the exact
  experiments launched before the gap and what changed since.
- **Autonomous follow-up** — cron matures experiments and the Mind sends an unprompted Telegram
  message with no human trigger anywhere in the path.

---

## 8. Technical specification

### 8.1 Feature space

| Dimension | Levels (v1) |
|---|---|
| `hook_type` | question, claim, number_list, story_cold_open, contrarian, demo_first |
| `length_bucket` | under_60s, 1_4m, 4_10m, 10_20m, 20m_plus |
| `thumbnail_archetype` | face_reaction, text_dominant, object_hero, before_after, none |
| `publish_slot` | weekday_am, weekday_pm, weekday_late, weekend_am, weekend_pm |
| `format` | tutorial, commentary, vlog, interview, list, shorts |
| `topic_cluster` | k=8 clusters learned per creator from title/description embeddings |

Dimensions are encoded one-hot and concatenated: `d = 6 + 5 + 5 + 5 + 6 + 8 = 35`.
Reward is modelled as additive over dimensions, so there is no combinatorial arm explosion.

### 8.2 Baseline (confound) model

```
log(views_hat) = b0
               + b1 * log(followers_at_publish)
               + b2 * dow_onehot
               + b3 * hour_bucket_onehot
               + b4 * days_since_last_post
               + b5 * global_time_index      # channel-level trend and seasonality
```

Ridge regression, recency-weighted (half-life 90 days), fit per creator, refreshed nightly.
`sigma_resid` is the residual standard deviation on the training set.

```
r_i = clip( (log(views_i) - log(views_hat_i)) / sigma_resid , -4, +4 )
```

### 8.3 Posterior over creative features

Bayesian linear regression with known noise variance `sigma^2` and Gaussian prior
`N(mu0, Lambda0^-1)`:

```
Sigma = ( X'X / sigma^2  +  Lambda0 )^-1
mu    = Sigma ( X'r / sigma^2  +  Lambda0 mu0 )
```

- `X` — `n x d` matrix of feature vectors of closed experiments
- `r` — `n x 1` residual rewards
- `mu0 = mu_niche` (hierarchical prior), `Lambda0 = tau^-2 I`
- Computed via Cholesky. `d = 35`, so this is instant at any realistic `n`.

**Action selection (Thompson sampling):**

```
theta_tilde ~ N(mu, Sigma)
brief*      = argmax over candidates c of  theta_tilde' x_c
```

Exploration emerges from posterior uncertainty. No epsilon-greedy, no temperature hack.

**Exploration budget:** a candidate counts as exploratory when `x_c' Sigma x_c` exceeds the 75th
percentile of the candidate set. At most `e%` of surfaced briefs may be exploratory. Enforced by
the Mind's policy step.

### 8.4 Hierarchical pooling

```
theta_creator ~ N( mu_niche , tau^2 I )
```

Nightly empirical Bayes across creators in a niche:

```
mu_niche = mean over creators of mu_c
tau^2    = max( var over creators of mu_c  -  mean over creators of diag(Sigma_c) , eps )
```

Effective shrinkage per creator is approximately `n / (n + sigma^2 / tau^2)`, surfaced in the UI.

### 8.5 Canon Gate

- Claim extraction: the Mind extracts atomic claims per post into the `claims` table with an
  embedding.
- Contradiction check: cosine top-k against the claim ledger, then the Mind adjudicates
  (agrees / contradicts / unrelated).
- Hook cooldown: default 14 days per `hook_type`, configurable.
- Dead-format check: block when `P(theta_feature < 0) >= 0.8` under the posterior.

---

## 9. Data model (Postgres / Neon)

> **Implementation status (2026-08-26):** this section is the original spec.
> The shipped build uses **Cloudflare D1** (SQLite) for the ledger with the
> same Drizzle schema, one definition and two handles: `bun:sqlite` locally
> and D1 in the Worker. See `ARCHITECTURE.md` for the shipped data layer.
> Everything else in the PRD is as implemented unless noted.

```sql
creators(id, handle, platform, niche, followers, created_at, tz, exploration_budget)
posts(id, creator_id, platform_post_id, published_at, title, description, url, raw jsonb)
features(post_id, schema_version, hook_type, length_bucket, thumbnail_archetype,
         publish_slot, format, topic_cluster, vector real[], labeled_by, labeled_at)
metrics(post_id, checkpoint, collected_at, views, watch_time, comments,
        likes, follower_delta)                      -- checkpoint in {24h,72h,168h}
experiments(id, post_id, creator_id, status, opened_at, closed_at,
            reward real, reward_components jsonb)   -- status in {open,maturing,closed,void}
baselines(creator_id, fitted_at, coefs jsonb, sigma_resid real, n_train int)
posteriors(creator_id, version, updated_at, mu bytea, sigma bytea, n_obs int)
posterior_snapshots(creator_id, week, mu bytea, sigma bytea)
belief_diffs(id, creator_id, experiment_id, created_at, deltas jsonb, summary text)
niche_priors(niche, updated_at, mu bytea, tau2 real, n_creators int)
claims(id, creator_id, post_id, text, embedding vector(768), stated_at)
bits(id, creator_id, name, description, last_used_at)
briefs(id, creator_id, created_at, features jsonb, predicted_lift real,
       ci_low real, ci_high real, rationale text, is_exploratory bool, status)
gate_events(id, brief_id, rule, verdict, explanation, overridden bool)
notifications(id, creator_id, sent_at, channel, body, trigger jsonb)
```

Indexes: `experiments(creator_id, status)`, `metrics(post_id, checkpoint)`,
ivfflat on `claims(embedding)`.

---

## 10. Success criteria (jam scoring)

| Criterion | How RATCHET scores |
|---|---|
| Minds integration depth | Mind owns memory, semantic labelling, policy, and notification judgement. Not removable. |
| Creator-economy problem fit | Universal, unsexy, expensive: creators learn the wrong lessons from confounded data. |
| Innovation and creativity | Per-creator contextual bandit on residualised rewards with hierarchical priors. Absent from the 5.4k-project corpus. |
| Execution and completeness | Closed-form math, real data source, live cron, visible persistence. |
| Viability and scalability | Cold start solved on day 1 by pooling; the moat compounds daily; obvious per-channel SaaS pricing. |

### Demo acceptance test (must pass before submission)

1. Seed 8 weeks of history — posterior is non-trivial and credible intervals are visible.
2. Publish a new post — an experiment opens automatically.
3. Advance the clock — cron matures it with no human input and a belief-diff is written.
4. A Telegram message arrives unprompted, referencing prior context.
5. Week-1 and week-8 posteriors render side by side and visibly differ.
6. Canon Gate blocks a deliberately contradictory draft and explains why.

---

## 11. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Platform API quota or OAuth friction | High | YouTube is the single real connector; CSV importer for everything else. Documented honestly. |
| Small-n noise causing overconfident claims | High | Hierarchical shrinkage, always render credible intervals, never point estimates, reward clipping. |
| 6-day timeline | High | Cut order defined in section 12. Three components are non-negotiable. |
| Mind labelling instability (same post relabelled) | Medium | Labels written to memory once and reused; schema-versioned. |
| Viral outlier dominating the posterior | Medium | +/-4 sigma reward clipping plus log transform. |
| Notification spam | Low | Materiality threshold plus a 1-per-24h rate limit. |

---

## 12. Scope and cut order (6 days)

| Day | Ship |
|---|---|
| 22 Aug | Mind and memory schema, Neon tables, YouTube ingest, 8-week seed history |
| 23 Aug | Featuriser, baseline ridge model, residual reward, experiment ledger |
| 24 Aug | Bayesian-linear posterior, Thompson sampling, brief generation via the Mind |
| 25 Aug | Cron maturation worker, Telegram autonomous ping, Canon Gate |
| 26 Aug | Hierarchical pooling job, dashboard |
| 27 Aug | Demo video, README, technical documentation |
| 28 Aug | Buffer, final QA against the section 10 acceptance test, submit |

**Cut order if behind:**

1. Hierarchical pooling becomes a static hand-authored niche prior JSON.
2. Canon Gate keeps claims only; drop bits and hook cooldown.
3. X connector dropped; YouTube only.
4. Time-travel UI becomes static screenshots of two snapshots.

**Never cut:** residualised reward, Thompson sampling posterior, autonomous cron follow-up.
Those three are the submission.

---

## 13. Open questions

- OQ-1 Reward blend weights for views / retention / follower delta. Fixed in v1, learnable later.
- OQ-2 Niche taxonomy granularity. Start with 12 coarse niches.
- OQ-3 Whether provisional 24h signals should partially update the posterior with inflated
  `sigma^2`. v1 answer: no, display only.
