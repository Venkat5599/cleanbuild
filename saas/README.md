# RATCHET frontend

This directory is the product surface: a Next.js 16 app containing the
landing page and the dashboard (`/dashboard/*`).

It is a rebrand of a commercial SaaS landing template (React Bits Pro license,
see `LICENSE`), with every marketing placeholder removed — there are no
testimonials, no fake logos, no pricing tiers, because RATCHET has none of
those things. The landing says what the product does; the dashboard shows the
real model state.

## Data

The dashboard reads the RATCHET Worker (Cloudflare) over its oRPC endpoint.
When the Worker is unreachable it renders the labelled capture in
`lib/snapshot.json` and says so on every page (see `lib/ratchet.ts`). The
snapshot is regenerated from a verified pipeline run:

```bash
cd ..            # repo root
bun run scripts/migrate.ts
bun run scripts/seed-history.ts
bun run scripts/verify-recovery.ts
bun run scripts/generate-briefs.ts
bun run scripts/export-snapshot.ts
```

Set `RATCHET_API_URL` to point at the deployed Worker when one is live.

## Run

```bash
npm install
npm run dev
```

Requires Node 22+.