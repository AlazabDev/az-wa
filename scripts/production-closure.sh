#!/usr/bin/env bash
# AzWA production closure gates. Read-only against external services.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

phase="environment"
trap 'rc=$?; printf "\nFAIL [%s] exit=%s\n" "$phase" "$rc" >&2; exit "$rc"' ERR
printf 'AzWA Production Closure | Node=%s | project=%s\n' "$(node --version)" "$PWD"
phase="toolchain"; node scripts/verify-toolchain.mjs
command -v bun >/dev/null || { echo 'FAIL: Bun is not installed'; exit 1; }
[ "$(bun --version)" = "$(node -p "require('./package.json').packageManager.split('@')[1]")" ] || { echo 'FAIL: Bun runtime version does not match pinned packageManager'; exit 1; }
phase="lockfile install"; bun install --frozen-lockfile
phase="production preflight"; node scripts/production-preflight.mjs
phase="existing regression tests"; bun run test:guards; bun run test:design; bun run test:integration; bun run test:security
phase="route inventory before build"; bun run test:routes
phase="build"; NITRO_PRESET=node-server bun run build
test -s .output/server/index.mjs || { echo 'FAIL: Nitro server artifact missing or empty'; exit 1; }
phase="route inventory after build"; bun run test:routes
phase="TypeScript"; bun run typecheck
phase="ESLint"; bun run lint
printf '\nPASS: static production closure gates passed. Live auth/Meta/Supabase/staging gates remain separate.\n'
