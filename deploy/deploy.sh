#!/usr/bin/env bash
# Production deploy for AzWA using native Node.js + systemd.
# Usage on the server from the repository root: ./deploy/deploy.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if [ ! -f ".env" ]; then
  echo "ERROR: .env is missing. Copy .env.example to .env and fill production values." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

required_vars=(
  VITE_SUPABASE_URL
  VITE_SUPABASE_PUBLISHABLE_KEY
  VITE_SUPABASE_PROJECT_ID
  SUPABASE_URL
  SUPABASE_PUBLISHABLE_KEY
  SUPABASE_SERVICE_ROLE_KEY
  META_WEBHOOK_PUBLIC_URL
  AZWA_CRON_SECRET
)

for var_name in "${required_vars[@]}"; do
  if [ -z "${!var_name:-}" ]; then
    echo "ERROR: required environment variable $var_name is empty" >&2
    exit 1
  fi
done

NODE_BIN="$(command -v node || true)"
BUN_BIN="$(command -v bun || true)"

if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js is not installed or not in PATH" >&2
  exit 1
fi

if [ -z "$BUN_BIN" ]; then
  echo "ERROR: Bun is not installed or not in PATH" >&2
  exit 1
fi

NODE_MAJOR="$($NODE_BIN -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "ERROR: Node.js 24+ is required; found $($NODE_BIN --version)" >&2
  exit 1
fi

if [ "$(id -u)" -eq 0 ]; then
  SUDO=()
else
  SUDO=(sudo)
fi

chmod 600 .env

if [ -z "$(git status --porcelain)" ]; then
  echo "==> Pulling latest code"
  git pull --ff-only
else
  echo "==> Local modifications detected; preserving them and skipping git pull"
fi

echo "==> Installing locked dependencies"
"$BUN_BIN" install --frozen-lockfile

echo "==> Building TanStack/Nitro production output"
"$BUN_BIN" run build

echo "==> TypeScript validation"
"$BUN_BIN" run typecheck

echo "==> Lint validation"
"$BUN_BIN" run lint

# One-time migration cleanup. Docker is not a runtime dependency; if an old
# AzWA Compose deployment still exists, remove only its containers after the
# new build has passed all validation gates and before systemd binds port 8085.
if command -v docker >/dev/null 2>&1; then
  mapfile -t legacy_container_ids < <(
    docker ps -aq --filter "label=com.docker.compose.project=az-wa" 2>/dev/null || true
  )

  if [ "${#legacy_container_ids[@]}" -gt 0 ]; then
    echo "==> Removing legacy AzWA Docker containers"
    docker rm -f "${legacy_container_ids[@]}" >/dev/null
  elif docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx 'az-wa-web'; then
    echo "==> Removing legacy az-wa-web Docker container"
    docker rm -f az-wa-web >/dev/null
  fi
fi

echo "==> Installing systemd service"
sed \
  -e "s|__APP_DIR__|$APP_DIR|g" \
  -e "s|__NODE_BIN__|$NODE_BIN|g" \
  deploy/az-wa.service \
  | "${SUDO[@]}" tee /etc/systemd/system/az-wa.service >/dev/null

"${SUDO[@]}" systemctl daemon-reload
"${SUDO[@]}" systemctl enable az-wa.service >/dev/null
"${SUDO[@]}" systemctl restart az-wa.service

echo "==> Waiting for liveness"
for i in $(seq 1 45); do
  if curl -fsS http://127.0.0.1:8085/healthz >/dev/null; then
    break
  fi
  if [ "$i" -eq 45 ]; then
    echo "ERROR: AzWA did not become live" >&2
    "${SUDO[@]}" systemctl status az-wa.service --no-pager >&2 || true
    "${SUDO[@]}" journalctl -u az-wa.service -n 120 --no-pager >&2 || true
    exit 1
  fi
  sleep 1
done

echo "==> Waiting for readiness"
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8085/readyz >/dev/null; then
    echo "AzWA is ready after ${i}s"
    "${SUDO[@]}" systemctl --no-pager --full status az-wa.service
    exit 0
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: application is live but not ready" >&2
    "${SUDO[@]}" systemctl status az-wa.service --no-pager >&2 || true
    "${SUDO[@]}" journalctl -u az-wa.service -n 120 --no-pager >&2 || true
    exit 1
  fi
  sleep 1
done
