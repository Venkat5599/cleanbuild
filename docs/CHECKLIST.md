# RATCHET — Submission Checklist (verified state, 2026-08-28)

Status: ✅ verified by run output · 🟡 code ready, needs a credential/action from the owner · 🔴 open

## A. Jam requirements

- [x] **BLOCKER** A1 Working product, runnable from a fresh clone — fresh-clone gate passed (output quoted in README)
- [x] **BLOCKER** A2 A Minds agent is integral — ownership table in `docs/MINDS.md`; "remove the Mind and what breaks" in README
- [x] **BLOCKER** A3 Persistence: memory + continuity + autonomous follow-up — real Minds delivery verified (`[mind] delivered`, Wake replied)
- [x] **BLOCKER** A4 One declared track — **Audience Growth & Engagement**, stated in README
- [ ] **BLOCKER** A5 Demo video 1.5–2.0 min — 🔴 user records (needs Minds credit top-up for the reply scene)
- [x] **BLOCKER** A6 Public code repository — `github.com/Venkat5599/cleanbuild`, no login needed
- [x] **BLOCKER** A7 Technical documentation in the repo — README + PRD + ARCHITECTURE + TECHNICAL + MINDS
- [ ] **BLOCKER** A8 Submitted before 2026-08-28 23:59 HKT — 🔴 user submits
- [ ] MAJOR A9 Student status declared if eligible — user
- [x] MINOR A10 One agent per team — single entry

## B. Acceptance test (PRD §10)

`bun scripts/demo-timetravel.ts` — self-contained 8-week spec, own DB.

- [x] **BLOCKER** B1 Posterior non-trivial, credible intervals visible — TIME TRAVEL PASSED
- [x] **BLOCKER** B2 Post published → experiment opens automatically — verified
- [x] **BLOCKER** B3 Clock advances → cron matures with zero human input — verified
- [x] **BLOCKER** B4 Belief-diff written — verified
- [x] **BLOCKER** B5 Unprompted follow-up arrives, references context — Minds delivery (channel `mind`); Telegram 🟡 token
- [x] **BLOCKER** B6 Week-1 vs week-8 render and visibly differ — verified
- [x] MAJOR B7 Canon Gate blocks a contradictory draft and explains why — verified (gate demo + act tests)

## C. Correctness

- [x] **BLOCKER** C1 Signal recovery — VERIFICATION PASSED (correlation 0.979, signs 5/5, drift 3.6e-16)
- [x] **BLOCKER** C2 One θ draw per round — C2 invariant + test
- [x] **BLOCKER** C3 Reward ~mean 0, sd 1 — baseline stats in verify output
- [x] MAJOR C4 ±4σ clip — property-tested
- [x] MAJOR C5 Variance monotone non-increasing — property-tested
- [x] MAJOR C6 Incremental vs recompute agree — verified by verify-recovery (3.6e-16 drift)
- [x] MAJOR C7 Labels stable, frozen per schema_version — insertFeatures guard
- [x] MAJOR C8 Idempotent by experiment id — openExperiment/insertPost guards
- [x] MAJOR C9 Missing metrics → void, never imputed — learn.ts path
- [x] MINOR C10 Seeded RNG reproducibility — fixed seeds everywhere

## D. Minds integration depth

- [x] **BLOCKER** D1 Memory survives a session boundary — live-verified
- [x] **BLOCKER** D2 Mind owns explore/exploit decisions, rationale persisted — act step + primary-mind loop
- [x] **BLOCKER** D3 Semantic labelling persists — claims + embeddings (lazy-cache, verified)
- [x] MAJOR D4 Notification-worthiness is the Mind's judgement, delivered — materiality briefings to Wake
- [x] MAJOR D5 Continuity opener after silence — demo time-skip; Wake reply
- [x] MAJOR D6 No numeric inference in the LLM — arithmetic is deterministic TS (gate, baseline, posterior, pooling)
- [x] MAJOR D7 `docs/MINDS.md` ownership table present and honest
- [x] MINOR D8 "Remove the Mind and here is what breaks" in README

## E. Demo video

All 🔴 user — the repo is ready: local dashboard + seeded ledger + Minds delivery verified. Sequence in `docs/TODO.md` D6.

## F. Repository

- [x] **BLOCKER** F1 Fresh-clone gate — passed, quoted in README
- [x] **BLOCKER** F2 No secrets committed — scan of git history clean (post final push)
- [x] **BLOCKER** F3 `.env.example` covers every required key
- [x] MAJOR F4 README complete (track, loops, setup, seeded demo, honesty)
- [x] MAJOR F5 `docs/TECHNICAL.md` — math for judges
- [x] MAJOR F6 Architecture diagram in README (ASCII)
- [x] MAJOR F7 LICENSE (MIT)
- [x] MAJOR F8 Honest limitations — small-n, synthetic-history labelling, "not deployed" table
- [x] MINOR F9 Builds clean — 78 tests / 0 fail / 4527 expects; `tsc --noEmit` exit 0 (root + saas)
- [x] MINOR F10 Legible commit history — conventional, authored by the repo owner

## G. Product surface

- [x] MAJOR G1 No dead controls — nav/CTAs wired; all routes 200 with Worker down (snapshot fallback)
- [x] MAJOR G2 Credible intervals everywhere — posterior page + briefs
- [x] MAJOR G3 Shrinkage displayed — "66% your data" from snapshot
- [x] MAJOR G4 Belief-diff reads as plain language
- [x] MAJOR G5 Cold-start designed — snapshot fallback + honest label
- [x] MINOR G6–G9 — design pass done (single theme, no template tells, real dashboard capture)

## H. Safety and honesty

- [x] **BLOCKER** H1 Secrets never in memory/code — env-only, 600-perm local copies, temp files deleted
- [x] **BLOCKER** H2 RATCHET never publishes — read-only connectors; YouTube connector only ingests
- [x] MAJOR H3 Synthetic data labelled — `synthetic:true` per row + README honesty table
- [x] MAJOR H4 No fabricated metrics/logos/customers — stripped from the frontend
- [x] MAJOR H5 Video claims will match code — honesty table is the script contract
- [x] MINOR H6 Chat ids treated as secrets — env-only

## I. Final sequence

- [x] I1 All BLOCKERs closed except the two user-owned (A5 video, A8 submit)
- [x] I2 Fresh-clone re-run on final commit — done
- [ ] I3 Video re-timed — 🔴 user
- [ ] I4–I6 Submission form, visibility check, submit — 🔴 user
- [x] I7 Tag `v1.0-jam` — tagged at final push
- [ ] I8 Confirmation screenshot — 🔴 user

## Kill criteria

Not triggered — the three never-cut items (residualised reward, Thompson posterior, autonomous cron follow-up) are all shipped and verified.