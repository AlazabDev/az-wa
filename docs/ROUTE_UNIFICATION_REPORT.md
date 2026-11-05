# AzWA route-tree unification — 2026-11-05

## Decision

TanStack Start `src/routes` is the sole active router; `src/router.tsx` imports
`src/routeTree.gen.ts`. Legacy Next.js `src/app` and React Router SPA
`src/App.tsx` / `src/pages` are kept in place and explicitly noncanonical.
This is a **routing-source unification**, not migration of legacy features.

## Changed files

- `scripts/unified-route-tree.mjs`: strict inventory, duplicate route-ID/URL
  detection, legacy route imports check, generated route import consistency.
- `docs/ROUTE_TREE.md`: deterministic complete inventory of route IDs, URLs,
  classification and source files.
- `package.json`: `test:routes` validates the existing source tree and the
  canonical inventory; `routes:sync` regenerates the inventory.
- `scripts/production-closure.sh`: uses `bun run test:routes` before/after build.
- `.github/workflows/quality-gate.yml`: uses the same route contract in CI.
- `src/routes/README.md`: explicit ownership rules.

## Measured in delivered snapshot

- 45 route modules: 1 root, 1 layout, 9 API, 34 page modules.
- Generated `src/routeTree.gen.ts` import inventory matches the route files.
- No duplicate route ID or resolved URL among active modules.
- No direct legacy page imports in active route modules.
- Existing two route-tree tests: pass.
- `unified-route-tree.mjs --check`: pass.
- `bash -n scripts/production-closure.sh`: pass.

## Production status

No dependency install, Nitro build, browser routing, or live HTTP endpoint tests
were run for this tree-only update. Legacy source has not been moved or deleted,
by design. The security scanner fix under discussion is not part of this patch.

## Commands on AlazabCore

```bash
cd /mnt/f/apps/az-wa
bun run test:routes
# After adding/changing a route, build to regenerate src/routeTree.gen.ts:
NITRO_PRESET=node-server bun run build
bun run routes:sync
bun run test:routes
```
