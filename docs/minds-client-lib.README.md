# @animocabrands/minds-client-lib

TypeScript client library for the **Hello Minds Builder API** ([api.build](https://api.build.hellominds.ai)) — messaging, account automation, and builder operations for programmatic agents and apps.

**Get started:** [Minds Client Library guide](https://build.hellominds.ai/docs/get-started/client-library) on build.hellominds.ai

**Requirements:** Node.js ≥ 22 (ESM).

## Install

```bash
npm install @animocabrands/minds-client-lib
```

## Authentication

Create a **Builder API key** at [build.hellominds.ai/console](https://build.hellominds.ai/console), then pass it to `createMindsClient` for account and messaging routes. The library does **not** load `.env` — your app or the `minds` CLI handles that.

**Bazaar catalog** (`client.bazaar.*`) is public — no API key required. Omit `builderApiKey` for catalog-only use, or pass it when you want auth headers sent on bazaar requests (e.g. future protected metadata).

```ts
import { BUILDER_API_KEY_ENV, createMindsClient } from "@animocabrands/minds-client-lib";

const builderApiKey = process.env[BUILDER_API_KEY_ENV];
if (!builderApiKey) throw new Error(`${BUILDER_API_KEY_ENV} is not set`);

const client = createMindsClient({ builderApiKey });
```

| Constant                 | Value                   |
| ------------------------ | ----------------------- |
| `BUILDER_API_KEY_ENV`    | `MINDS_BUILDER_API_KEY` |
| `BUILDER_API_KEY_HEADER` | `X-Api-Key`             |

The api.build host is fixed in the library — builders do not configure a base URL.

## Quick start — messaging

```ts
import { createMindsClient } from "@animocabrands/minds-client-lib";

const client = createMindsClient({ builderApiKey: process.env.MINDS_BUILDER_API_KEY! });

// List Minds on your account (mindId + name)
const minds = await client.listMinds();

// Ensure a conversation, then send
await client.ensureConversation("main", minds[0]!.mindId);
await client.sendMessage({ alias: "main", messageText: "Hello" });

// Wait for a Mind reply (SSE + history poll)
const { reply, timedOut } = await client.waitForReply({
  alias: "main",
  timeoutMs: 120_000,
});
if (!timedOut && reply) {
  console.log(reply.messageText);
}
```

## API reference

All methods require a valid Builder API key unless noted. Errors throw `MindsApiError` with `status`, `code`, and `message`.

### Account & Minds

| Method             | Description                                                             |
| ------------------ | ----------------------------------------------------------------------- |
| `listMinds(opts?)` | List Minds on the builder account. `humanId` defaults from the key JWT. |
| `getMind(mindId)`  | Full Mind details (`walletAddress`, `chain`, `email`, …).               |

### Messaging

| Method                               | Description                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `createConversation(body)`           | Create conversation `{ alias, mindId }`.                                     |
| `ensureConversation(alias, mindId)`  | Create or return existing (handles 409).                                     |
| `listConversations()`                | List all conversations.                                                      |
| `getConversation(alias)`             | Get one conversation.                                                        |
| `sendMessage(body)`                  | Send `{ alias, messageText, attachments? }`.                                 |
| `getHistory(alias, opts?)`           | Full transcript (human + Mind). Public rows use `senderType` (0 Mind, 1 human). |
| `getLatestHistoryFingerprint(alias)` | Convenience for reply detection.                                             |
| `getMindIdForAlias(alias)`           | Resolve mindId from conversation or Mind history rows.                       |

### Events (SSE)

| Method                                                                             | Description                                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `subscribeEvents({ alias?, onEvent, onError?, signal? })`                          | Callback-based SSE subscription.                                                     |
| `eventsIterator({ alias?, signal? })`                                              | Async generator over SSE events.                                                     |
| `waitForReply({ alias, timeoutMs, afterFingerprint?, sentMessageText?, signal? })` | Wait for a Mind reply; returns `{ reply, timedOut: false }` or `{ timedOut: true }`. |

Use `isReplyEvent(event, context)` to detect Mind replies in custom SSE handling.

### Cognition balance & usage

| Method                                   | Description                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `getCognitionUsage(mindId, opts?)`       | Spend over time. `interval`: `1m`, `5m`, `15m`, `1h`, `1d`, `1w`, `1M`. |
| `getCognitionUsageByTool(mindId, opts?)` | Breakdown by tool. `interval`: `hour`, `day`, `week`, `month` only.     |
| `getCognitionBalance(mindId)`            | Cognition balance available for the Mind (`{ mindId, cognition }`).     |

### Mind status

| Method                                    | Description                           |
| ----------------------------------------- | ------------------------------------- |
| `updateMindStatus(mindId, { isEnabled })` | Enable or disable a Mind. Idempotent. |

### Equipped skills & apps

Discover catalog IDs via `client.bazaar`, then equip on a Mind. Body is always `{ ids: string[] }` (UUIDs).

| Method                              | Description                                      |
| ----------------------------------- | ------------------------------------------------ |
| `listEquippedSkills(mindId)`        | Skills currently equipped on the Mind.           |
| `equipSkills(mindId, { ids })`      | Equip skills. Returns `{ results: [...] }`.      |
| `unequipSkills(mindId, { ids })`    | Unequip skills.                                  |
| `listEquippedApps(mindId)`          | Apps currently equipped on the Mind.             |
| `equipApps(mindId, { ids })`        | Equip apps.                                      |
| `unequipApps(mindId, { ids })`      | Unequip apps.                                    |

### Circles (human collaborators)

| Method                                            | Description                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| `getCircle(mindId)`                               | Member array (`CircleMember[]`) — steward + human collaborators.      |
| `addCircleMembers(mindId, { emails, isActive? })` | Add **human** collaborators by email. Returns `CircleMutationResult`. |
| `removeCircleMembers(mindId, { emails })`         | Remove **human** collaborators by email.                              |
| `listCirclesForAccount(opts?)`                    | `listMinds()` + parallel `getCircle()` per Mind.                      |

**Not documented for builders today:** adding other **Minds** via these methods — use external
human emails (e.g. `colleague@company.com`). If the platform later supports Mind platform emails
on add/remove, the client passes them through; verify with `result` and `getCircle()`.

### Bazaar (public catalog)

No Builder API key required. Access via `client.bazaar` on any `MindsClient` (including `createMindsClient({})`).

| Method                              | Description                                         |
| ----------------------------------- | --------------------------------------------------- |
| `bazaar.listSkills(opts?)`          | Search/list skills (`search`, `page`, `pageSize`).  |
| `bazaar.getSkill(skillId)`          | Skill detail.                                       |
| `bazaar.listApps(opts?)`            | Search/list apps (`search`, `tier`, pagination).    |
| `bazaar.getApp(appId)`              | App detail (includes `tools[]`).                    |
| `bazaar.collectSearchResults(opts)` | Auto-paginate, sort, filter, slice (CLI uses this). |

```ts
const client = createMindsClient();
const apps = await client.bazaar.listApps({ search: "notion", tier: "verified" });
```

## Types

Exported types include `BuilderMind`, `BazaarSkill`, `BazaarApp`, `EquippedSkill`, `EquippedApp`, `EquipIdsBody`, `Conversation`, `MessageRecord`, `MessagingEvent`, `CognitionBalance`, `CognitionUsageResponse`, `CognitionUsageByToolResponse`, `CircleMember`, `CircleMutationResult`, `AccountCircle`, and option/body types for each method.

`MessageRecord` / SSE events expose **`senderType`** (0 = Mind, 1 = human).

## CLI alternative

Prefer a shell workflow? Use [@animocabrands/minds-cli](https://www.npmjs.com/package/@animocabrands/minds-cli) — same api.build surface with JSON stdout, exit codes, and `--help` examples on every command.

```bash
npx @animocabrands/minds-cli@latest doctor
npx @animocabrands/minds-cli@latest list
```

## License

UNLICENSED — private alpha tooling.
