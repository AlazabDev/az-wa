# AzWA deployment contract (Phase 1)

Canonical package manager: **Bun 1.3.3** (`bun.lock`). Runtime: **Node.js 24+**. The root lockfile must match `package.json`.

## Predeployment checks

```bash
node scripts/verify-toolchain.mjs
bun install --frozen-lockfile
node scripts/production-preflight.mjs
node --test scripts/production-guards.test.mjs scripts/toolchain-contract.test.mjs
NITRO_PRESET=node-server bun run build
bun run typecheck
bun run lint
test -f .output/server/index.mjs
```

Do not invoke production deployment until the above complete successfully in the target toolchain and the app passes integration tests against staging services.

## Existing production script

`deploy/deploy.sh` manages only PM2 process `azwa-app` on 127.0.0.1:8085. It intentionally does **not** alter Nginx. Production secrets stay in `/etc/az-wa/az-wa.env`. Live DB migration is opt-in via `--apply-migrations` and requires separate review.

```bash
./deploy/deploy.sh
```

This phase does **not** authorize live deployment or migrations. CI is a quality gate, not CD.
