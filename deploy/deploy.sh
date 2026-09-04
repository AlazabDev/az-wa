#!/usr/bin/env bash
# Production deploy for AzWA using native Node.js + systemd.
# Usage on the server from the repository root: bash deploy/deploy.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if [ ! -f ".env" ]; then
  echo "ERROR: .env is missing." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
if [ -f ".env.local" ]; then
  # shellcheck disable=SC1091
  source .env.local
fi
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
NPM_BIN="$(command -v npm || true)"
CURL_BIN="$(command -v curl || true)"

if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js is not installed or not in PATH" >&2
  exit 1
fi
if [ -z "$NPM_BIN" ]; then
  echo "ERROR: npm is not installed or not in PATH" >&2
  exit 1
fi
if [ -z "$CURL_BIN" ]; then
  echo "ERROR: curl is not installed or not in PATH" >&2
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
[ ! -f .env.local ] || chmod 600 .env.local

if [ -z "$(git status --porcelain)" ]; then
  echo "==> Pulling latest code"
  git pull --ff-only
else
  echo "==> Local modifications detected; preserving them and skipping git pull"
fi

echo "==> Installing locked dependencies"
"$NPM_BIN" ci

echo "==> Building TanStack/Nitro production output"
"$NPM_BIN" run build

echo "==> TypeScript validation"
"$NPM_BIN" run typecheck

echo "==> Lint validation"
"$NPM_BIN" run lint

echo "==> Installing systemd application service"
sed \
  -e "s|__APP_DIR__|$APP_DIR|g" \
  -e "s|__NODE_BIN__|$NODE_BIN|g" \
  deploy/az-wa.service \
  | "${SUDO[@]}" tee /etc/systemd/system/az-wa.service >/dev/null

echo "==> Installing systemd runtime worker"
sed \
  -e "s|__APP_DIR__|$APP_DIR|g" \
  deploy/az-wa-runtime.service \
  | "${SUDO[@]}" tee /etc/systemd/system/az-wa-runtime.service >/dev/null

"${SUDO[@]}" cp deploy/az-wa-runtime.timer /etc/systemd/system/az-wa-runtime.timer

"${SUDO[@]}" systemctl daemon-reload
"${SUDO[@]}" systemctl enable az-wa.service >/dev/null
"${SUDO[@]}" systemctl enable az-wa-runtime.timer >/dev/null
"${SUDO[@]}" systemctl restart az-wa.service
"${SUDO[@]}" systemctl restart az-wa-runtime.timer

echo "==> Waiting for liveness"
for i in $(seq 1 45); do
  if "$CURL_BIN" -fsS http://127.0.0.1:8085/healthz >/dev/null; then
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
  if "$CURL_BIN" -fsS http://127.0.0.1:8085/readyz >/dev/null; then
    echo "AzWA is ready after ${i}s"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: application is live but not ready" >&2
    "${SUDO[@]}" systemctl status az-wa.service --no-pager >&2 || true
    "${SUDO[@]}" journalctl -u az-wa.service -n 120 --no-pager >&2 || true
    exit 1
  fi
  sleep 1
done

echo "==> Verifying runtime worker"
"${SUDO[@]}" systemctl start az-wa-runtime.service
"${SUDO[@]}" systemctl is-enabled az-wa-runtime.timer >/dev/null
"${SUDO[@]}" systemctl is-active az-wa-runtime.timer >/dev/null

echo "==> AzWA production runtime is active"
"${SUDO[@]}" systemctl --no-pager --full status az-wa.service
"${SUDO[@]}" systemctl --no-pager --full status az-wa-runtime.timer
