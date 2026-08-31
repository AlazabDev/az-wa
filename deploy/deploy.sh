#!/usr/bin/env bash
# Production deploy for AzWA.
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

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Building TanStack Node image"
docker compose build --pull

echo "==> Restarting container"
docker compose up -d --remove-orphans

echo "==> Waiting for liveness"
for i in $(seq 1 45); do
  if curl -fsS http://127.0.0.1:8085/healthz >/dev/null; then
    break
  fi
  if [ "$i" -eq 45 ]; then
    echo "ERROR: container did not become live" >&2
    docker compose logs --tail 120 web >&2
    exit 1
  fi
  sleep 1
done

echo "==> Waiting for readiness"
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8085/readyz >/dev/null; then
    echo "AzWA is ready after ${i}s"
    docker image prune -f >/dev/null || true
    exit 0
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: application is live but not ready" >&2
    docker compose logs --tail 120 web >&2
    exit 1
  fi
  sleep 1
done
