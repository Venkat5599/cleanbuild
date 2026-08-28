# RATCHET — Technical notes (for judges)

Everything here matches code that runs in this repo; each section names the
module that implements it. Numbers in parentheses are from the last verified
run of the cited script.

## 1. The experiment spine

A post is an experiment. `openExperiment` stamps checkpoints at t+24h, t+72h,
t+168h (`CHECKPOINT_HOURS`). At each checkpoint a metric row is written by the
collector; at 168h the experiment closes and its reward enters the posterior.
Missing metrics at 168h → `status = void`, excluded — nothing is imputed into
the learning path (`learn.ts`).

## 2. Residualised reward

`core/reward.ts`. A weighted ridge baseline (`core/baseline.ts`, half-life
90d) fits expected performance from the creator's own recent history; the
reward is the residual z-score

    r = (observed − ŷ) / σ_resid

clipped to ±4σ. The clip exists so one viral outlier cannot dominate `mu` —
it caps any single update; the property is enforced by test. After seeding,
the reward distribution is approximately mean 0, sd 1 (the baseline model's
first job).

## 3. The Bayesian Mind

`core/posterior.ts`. The prior starts at 0 with diagonal tau². Each closed
experiment updates `mu` and `Sigma` with a conjugate normal update via
Sherman–Morrison (O(d²) incremental); a nightly recompute re-derives the
posterior with Cholesky from all closed experiments and the two must agree —
`verify-recovery.ts` measures the divergence: **3.6e-16** on the verified
ledger.

`marginal(θ, i)` gives the per-feature posterior: `P(helps)`, effect size and
a credible interval. Per-σ belief moves are ≈ 0.023 at n=194, so the ±4σ clip
is what keeps single experiments from crossing the materiality line alone —
the demo's breakout is a +3.9σ post computed from the creator's **own fitted
baseline**, not a hardcoded view count.

## 4. Thompson sampling — with one draw per round

`act.ts`. Candidate briefs are scored under **one** posterior draw
(`sampleTheta`) per decision round — drawing per candidate would be argmax
over independent noise, not Thompson sampling, and would destroy the
exploration guarantee (this is checked explicitly, C2). Exploration is a
budget: candidates whose predictive variance `x'Σx` sits above the p75
quantile are exploratory, and a per-creator budget (default 0.25) caps how
often the exploratory arm is taken. Every brief is persisted with its
predicted lift and credible interval before the gate sees it — a blocked
draft is an audit row, not a silent discard.

## 5. The Canon Gate

`act.ts`, `embed.ts`. Four rules, each writing a `gate_events` row (pass or
block) so `/gate` shows the checks that ran, not only the failures:

1. **dead_format** — any active feature with `P(helps) ≤ 0.2` is ruled out;
2. **hook_cooldown** — same hook inside 14 days is a repeat, not a test;
3. **contradiction (lexical)** — Jaccard token overlap ≥ 0.5 with a recorded
   canon claim blocks the draft;
4. **contradiction (semantic)** — when `EMBEDDING_*` is configured, claims
   are embedded once (lazy, cached in `claims.embedding`) and a draft whose
   cosine similarity to any claim clears **0.8** is blocked, even with zero
   shared tokens. The request shape `{model, input}` was verified against a
   live OpenAI-compatible endpoint; without configuration the rule is inert
   and the deterministic rules carry the gate (a gate must degrade to its
   rules, never to silence).

## 6. Hierarchical pooling across creators

`core/pooling.ts`, `learn.ts` (`poolNiches`). Posteriors from creators in the
same niche are combined with method-of-moments empirical Bayes:

- between-niche variance τ² is estimated from the observed variance of the
  creator posteriors (a floor of 0.01 acts as ~100 pseudo-observations, so a
  full-history creator keeps most of its own data — measured own-data weight
  **0.66** at n=194);
- each creator's prior is then the shrinkage mixture
  `prior_i = (1−w)·pooled + w·own`, w from its own n;
- niches with fewer than 3 creators do not pool; a thin night never
  downgrades a stored pooled prior (`niche_priors`).

Minds observe the same numbers the code does — the Mind is the loop's
judgement layer, never its arithmetic.

## 7. The verification / acceptance pair

Two scripts, two jobs:

- `scripts/verify-recovery.ts` — the ledger (40 weeks, **194 closed
  experiments**): plant five known effects (+0.60 question hook, etc.),
  fit, then assert the recovered posterior ranks the planted effect first
  among the planted set and matches signs 5/5. Result: **VERIFICATION
  PASSED**, recovered correlation **0.979**.
- `scripts/demo-timetravel.ts` — a fully self-contained 8-week acceptance
  test on its own database (the B1 spec in PRD §10): mature without human,
  posterior mutates, materiality cleared, briefing composed, a new brief
  proposed, and a deliberately contradictory draft blocked. 7/7 checks;
  with `--deliver` it sends a real briefing to the Minds agent.

## 8. Honest numbers

| Quantity | Value | Source |
|---|---|---|
| Closed experiments | 194 | verify-recovery |
| Posterior weeks | 39 | snapshot |
| Ledger rows | 100 | snapshot |
| Briefs / gate events (7 blocks) | 8 / 24 | snapshot |
| Recovered correlation | 0.979 | verify-recovery |
| Incremental-vs-recompute drift | 3.6e-16 | verify-recovery |
| Own-data weight (making niche) | 0.66 | pool-niches → snapshot |
| Tests | 78 pass / 0 fail / 4527 expects | `bun test` |
| Typecheck | exit 0 (root + saas) | `tsc --noEmit` |

The demo history is synthetic and every seeded row carries `synthetic:true`;
the dashboard states when it is showing the labelled snapshot. Numbers shown
anywhere are reads from this repo's own verified runs.