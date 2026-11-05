# AzWA — TanStack merge staging boundary

## Production source of truth

Only `src/routes/**` and their actual imports form the active TanStack Start application.
`src/routeTree.gen.ts` is generated; never register archived Next.js pages as active routes.

## Isolated in this revision

32 files moved **without content deletion** from:
- `src/components/dashboard/**` (19 files, including one test)
- `src/components/flows/**` (11 files, including two tests)
- `src/components/agents/**` (2 files)

Their full source is preserved at `_isolated_legacy/pending-tanstack-merge/src/components/**`.

A second atomic relocation preserved **142 more files** under
`_isolated_legacy/pending-tanstack-merge/src/lib/**`, without changing their
source code or Git history:
- `src/lib/whatsapp/**`: 67 files (including tests)
- `src/lib/flows/**`: 19 files
- `src/lib/automations/**`: 15 files
- `src/lib/ai/**`: 35 files
- `src/lib/dashboard/**`: 6 files

**Total staged for controlled port: 174 files.** No active TanStack import
reached these old modules in the pre-move graph. This does not mean the
legacy source is already compatible or ready to activate.
The previous paths remain available in Git history. This is a source relocation, not a functional merge.

The runtime import-graph audit on 2026-11-05 showed zero reachable runtime
modules in these three directories (non-test counts: dashboard 18/18 staged,
flows 9/9 staged, agents 2/2 staged). The active TanStack dashboard and
WhatsApp Flows pages already use independent routes and services.

## Retained for a governed future merge

Do not delete the staged implementations of WhatsApp, flows, automations,
AI, or their tests. They include business logic and data contracts that
require deliberate migration. Do not bulk-move additional shared integrations
solely because they are not imported by active routes.

Before promoting a staged module into `src/**`:
1. Replace `next/link` and Next.js routing with TanStack Router.
2. Replace `next-intl` and its provider with an AzWA translation contract;
   retain Arabic/RTL message keys and variable interpolation.
3. Restore flow-canvas dependencies such as `@xyflow/react` only when the
   canvas is integrated, and regenerate the pinned Bun lockfile.
4. Map old `accountId`, permissions, and APIs to the current verified
   organization/WABA/number scope; never bypass server authorization.
5. Align shared UI component props (e.g. Card, Avatar, SelectTrigger) with
   current exported types. Do not silently introduce obsolete Next UI props.
6. Validate real API endpoints, RLS, idempotency, and webhook signature
   handling against the **clean** Supabase backend; never push historical
   `supabase/migrations/**` into production.
7. Add runtime tests and typecheck the promoted module with strict
   `tsconfig.json` before importing it into an active route.
8. Run `bun run verify:production`, then verify staging auth, Meta
   callbacks, queue workers and readiness against actual services.

## Check definitions

- `bun run typecheck`: strict, transitive check of active TanStack
  entrypoints. It is a **production** check, **not an all-source check**.
- `node scripts/integration-boundary.mjs`: describes the reachable runtime
  graph; refuses incompatible Next.js imports into that graph.
- `bun run test:routes`: validates the TanStack route source inventory.
- `bun run build`: confirms a deployable Nitro artifact, not live readiness.

An unrelated or staged module may still fail when typechecked independently.
Record and repair its errors as it is promoted; do not reduce TypeScript
strictness or silently count it as production-ready.
