# RATCHET × Minds — who owns what

The Minds agent is not a wrapper around RATCHET: it is one of the four loops.
This table is the honest, verified map of what the Mind owns, what the code
owns, and what breaks if the Mind is removed. The integration below was
verified against the live Builder API on 2026-08-27/28 with real deliveries —
not against a stub.

## Ownership table

| Capability | Owner | Implementation | If the Mind is removed |
|---|---|---|---|
| **What to test next** (explore/exploit) | Code + Mind | Code draws θ once per round and builds 8 candidates (`act.ts`); the Mind receives the top briefs and exercises judgement about them through the conversation | Briefs still generate, but nothing with judgement reviews them; the loop becomes a sampler |
| **Notification-worthiness** | Mind | Maturation computes the materiality statistic in deterministic TS; the Mind receives the materiality briefing and is the channel by which the creator learns the loop changed its mind | The experiment still matures, but the "my model changed its mind, and here is why" moment disappears — the product's memory proof |
| **Semantic labelling of posts** | Mind (primary) / heuristics | Claims and canon stances live in the `claims` table with embeddings; the YouTube connector labels by documented heuristics (`labeledBy: 'heuristic'`) | YouTube ingest still opens experiments, but nothing records the creator's stances into canon; the contradiction gate loses half its teeth |
| **Canon (what the creator has said)** | Mind | Claims are written to the `claims` table; the gate enforces them deterministically | The gate has nothing to enforce |
| **All arithmetic** (baseline, reward, posterior, pooling, gate thresholds) | Code only | `packages/core`, `packages/pipeline` — plain TS, no LLM in the numbers | Nothing changes — this is deliberate: the Mind is judgement, not math |
| **Continuity / memory across sessions** | Mind | The Mind's memory carries the creator's context; the loop resumes after silence (demo time-skip) | "Acknowledged — loop verified" continuity moment does not exist |

## The four loops

1. **Sense** — posts become experiments with feature vectors (connector + featurizer).
2. **Learn** — maturation closes experiments; the posterior updates; belief diffs are written.
3. **Propose** — act draws θ, proposes briefs, the Canon Gate checks them.
4. **Inform** — materiality briefings are delivered to the Mind; the Mind is the conversation surface where the creator experiences the loop.

## Verified integration surface (2026-08-27/28)

| Endpoint | Use | Status |
|---|---|---|
| `GET /v1/humans/{humanId}/minds` | List the account's Minds (humanId parsed from the key's payload) | ✅ live |
| `POST /v1/messaging/conversation` | Create a conversation under an alias | ✅ live |
| `POST /v1/messaging/message` | Send a briefing (`{alias, messageText}`) | ✅ live |
| `GET /v1/messaging/histories/{alias}` | Readback to confirm delivery | ✅ live |
| `GET /v1/minds/{mindId}/cognition/usage` | Credit usage (the balance endpoint is `/usage`, not `/balance`) | ✅ live |

Auth: `X-Api-Key` header, Builder key (JWT, role `builder`, issued at
build.hellominds.ai). The key is account-scoped — it is shared across the
account's Minds; conversations are namespaced by alias (`ratchet-live`).

## What has actually happened for real

- A real briefing was delivered to the Wake Mind: `[mind] delivered
  2026-09-03T06:24Z` during the acceptance run.
- Wake replied: *"Acknowledged — loop verified from this end."*
- Wake also reported **zero cognition credits** — the account must be topped
  up before the demo video can show the Mind replying unprompted. The code
  path is verified; the credit is the only gap.

## Design rules (enforced)

- **No numeric inference inside the LLM.** Arithmetic is deterministic
  TypeScript. The Mind never computes a probability.
- **The gate is not a prompt.** A contradiction check implemented as an LLM
  instruction is not a check; every canon rule is code.
- **Secrets never enter Mind memory.** Keys live in the environment, never in
  a message, a claim, or the conversation history.
- **The Mind is optional at the margins, not at the core.** Remove it and the
  product still learns — but the product *is* the Mind-informed loop, so the
  demo's defining scenes (unprompted follow-up, continuity after silence)
  disappear.