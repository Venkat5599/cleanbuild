# RATCHET — Submission Checklist

Run this top to bottom on **28 Aug before 18:00 HKT**. Nothing ships with an open **BLOCKER**.

Severity: **BLOCKER** = cannot submit · **MAJOR** = costs points · **MINOR** = polish

---

## A. Jam requirements (from the rules — non-negotiable)

- [ ] **BLOCKER** A1 Working product, runnable from a fresh clone
- [ ] **BLOCKER** A2 A Minds agent is integral to core operation — removing it breaks the product
- [ ] **BLOCKER** A3 Persistence demonstrated: memory **and** continuity **and** autonomous follow-up
- [ ] **BLOCKER** A4 Fits one declared track — **Audience Growth & Engagement**. Stated in the README.
- [ ] **BLOCKER** A5 Demo video 1.5–2.0 min. *Time it. 110s target. Under 90s or over 120s is a rules fail.*
- [ ] **BLOCKER** A6 Public code repository, accessible without a login
- [ ] **BLOCKER** A7 Technical documentation in the repo
- [ ] **BLOCKER** A8 Submitted before 2026-08-28 23:59 HKT
- [ ] MAJOR A9 Student status declared if eligible (separate $1,300 prize pool)
- [ ] MINOR A10 One agent per team — no second submission diluting the entry

---

## B. Acceptance test (PRD §10 — the functional gate)

Run `bun scripts/demo-timetravel.ts` with the browser closed.

- [ ] **BLOCKER** B1 8 weeks of history seeded; posterior is non-trivial; credible intervals visible
- [ ] **BLOCKER** B2 New post published → experiment opens automatically, no manual step
- [ ] **BLOCKER** B3 Clock advances → cron matures the experiment with **zero human input**
- [ ] **BLOCKER** B4 Belief-diff written: which weights moved, by how much, caused by which experiment
- [ ] **BLOCKER** B5 Telegram message arrives unprompted, references prior context by name
- [ ] **BLOCKER** B6 Week-1 and week-8 posteriors render side by side and visibly differ
- [ ] MAJOR B7 Canon Gate blocks a deliberately contradictory draft and explains why

---

## C. Correctness (the parts that silently break)

- [ ] **BLOCKER** C1 **Signal recovery**: posterior recovers the signal planted in `seed-history.ts` within tolerance
- [ ] **BLOCKER** C2 **One `theta_tilde` draw per decision round**, not per candidate. Drawing per candidate is not Thompson sampling and destroys the algorithm.
- [ ] **BLOCKER** C3 Reward distribution over seeded history is approximately mean 0, sd 1. If not, the baseline model is wrong and every downstream number is meaningless.
- [ ] MAJOR C4 Reward clipping at ±4σ verified — one planted viral outlier does not dominate `mu`
- [ ] MAJOR C5 Posterior variance is monotonically non-increasing under updates
- [ ] MAJOR C6 Incremental (Sherman–Morrison) and nightly (Cholesky) results agree within tolerance
- [ ] MAJOR C7 Labels are stable — re-running the featuriser does not relabel existing posts
- [ ] MAJOR C8 Experiment updates are idempotent by experiment id; replaying the worker does not double-count
- [ ] MAJOR C9 Missing metrics at 168h → `status = void`, excluded. Nothing imputed into the learning path.
- [ ] MINOR C10 Seeded RNG makes the demo reproducible across runs

---

## D. Minds integration depth (judging criterion 1)

- [ ] **BLOCKER** D1 Memory survives a session boundary — verified, not assumed
- [ ] **BLOCKER** D2 Mind owns the explore/exploit decision and writes its rationale to memory
- [ ] **BLOCKER** D3 Mind owns semantic labelling and the labels persist
- [ ] MAJOR D4 Mind owns the notification-worthiness judgement, not a threshold in a cron job
- [ ] MAJOR D5 `decisions` memory region drives the continuity opener after a silence gap
- [ ] MAJOR D6 No numeric inference inside the LLM — arithmetic is deterministic TypeScript
- [ ] MAJOR D7 `docs/MINDS.md` ownership table present and honest
- [ ] MINOR D8 "Remove the Mind and here is what breaks" stated explicitly in the README

---

## E. Demo video

- [ ] **BLOCKER** E1 Runtime between 1:30 and 2:00. Timed, not estimated.
- [ ] **BLOCKER** E2 Shows **what** you built and **why** — both, per the rules
- [ ] **BLOCKER** E3 The autonomous moment is on screen with no human interaction visible
- [ ] MAJOR E4 Week-1 vs week-8 posterior shown as the memory proof
- [ ] MAJOR E5 Audio is intelligible; no background noise; levels checked with headphones
- [ ] MAJOR E6 Screen text is legible at the video's delivered resolution
- [ ] MAJOR E7 Ends on the network-effect line — "every creator sharpens the prior for the next"
- [ ] MINOR E8 No dead air, no "let me just wait for this to load"
- [ ] MINOR E9 Hosted somewhere that will not expire or require sign-in

---

## F. Repository

- [ ] **BLOCKER** F1 Fresh-clone test passes: clone to a new directory, follow the README, it runs
- [ ] **BLOCKER** F2 **No secrets committed.** Run a secret scan. Check git history, not just HEAD.
- [ ] **BLOCKER** F3 `.env.example` covers every required key
- [ ] MAJOR F4 README: what it is, the four loops, setup, seeded-demo instructions, track declaration
- [ ] MAJOR F5 `docs/TECHNICAL.md` — the math, written for a judge
- [ ] MAJOR F6 Architecture diagram rendered in the README
- [ ] MAJOR F7 LICENSE present
- [ ] MAJOR F8 Honest limitations section — small-n caveats, single real connector, what is seeded
- [ ] MINOR F9 Repo builds clean: no type errors, no lint errors
- [ ] MINOR F10 Commit history is legible

---

## G. Product surface

- [ ] MAJOR G1 Every interactive control actually works when clicked. No dead controls.
- [ ] MAJOR G2 Credible intervals shown everywhere — **never** a bare point estimate
- [ ] MAJOR G3 Shrinkage weight displayed ("62% your data, 38% niche prior")
- [ ] MAJOR G4 Belief-diff feed reads as plain language, not a JSON dump
- [ ] MAJOR G5 Empty and cold-start states are designed, not broken
- [ ] MINOR G6 Content is visible without an entrance animation completing
- [ ] MINOR G7 Nothing clipped by a container edge; nothing jammed against a viewport edge
- [ ] MINOR G8 No AI-slop tells: no blue-purple gradients, no eyebrow pills, no icon-in-tinted-tile, no filled+outline button pair, no glow halos
- [ ] MINOR G9 Charts follow the `dataviz` skill; readable in both light and dark

---

## H. Safety and honesty

- [ ] **BLOCKER** H1 OAuth tokens encrypted at rest; never written to Mind memory
- [ ] **BLOCKER** H2 Read-only platform scopes. RATCHET never publishes on the creator's behalf.
- [ ] MAJOR H3 Seeded/synthetic data is labelled as such in the video **and** the README. Do not imply live users.
- [ ] MAJOR H4 No fabricated metrics, testimonials, logos, or customers anywhere in the submission
- [ ] MAJOR H5 Claims in the video match what the code does. Every one.
- [ ] MINOR H6 Telegram chat ids treated as secrets

---

## I. Final sequence (28 Aug)

- [ ] I1 All BLOCKERs above closed
- [ ] I2 Fresh-clone test re-run on the final commit
- [ ] I3 Video re-timed on the final export
- [ ] I4 Submission form filled — repo URL, video URL, track, student status
- [ ] I5 Repo visibility confirmed from a logged-out browser
- [ ] I6 **Submitted by 18:00 HKT.** The last 6 hours are buffer, not schedule.
- [ ] I7 Tag `v1.0-jam`
- [ ] I8 Confirmation received and screenshotted

---

## Kill criteria

Trigger the PRD §12 cut order the moment any of these is true:

- 25 Aug end of day: `demo-timetravel.ts` does not run end to end → cut immediately, do not wait for 27 Aug
- 26 Aug end of day: no dashboard → ship with static screenshots of two posterior snapshots
- 27 Aug midday: no video → drop Canon Gate from the video and shoot the core loop only

**Never cut:** residualised reward · Thompson sampling posterior · autonomous cron follow-up.
Those three are the submission. Everything else is presentation.
