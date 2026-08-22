#!/usr/bin/env bash
# Production deploy for wa.alazab.cloud
# Usage (on the server, from the repo root):  ./deploy/deploy.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if [ ! -f ".env.production" ]; then
  echo "ERROR: .env.production is missing. Copy .env.production.example and fill it in." >&2
  exit 1
fi

# Export public build variables for docker compose build args.
set -a
# shellcheck disable=SC1091
source .env.production
set +a

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Building image"
docker compose build --pull

echo "==> Restarting container"
docker compose up -d --remove-orphans

echo "==> Waiting for health"
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8085/healthz >/dev/null; then
    echo "Healthy after ${i}s"
    docker image prune -f >/dev/null || true
    echo "==> Deployed: https://wa.alazab.cloud"
    exit 0
  fi
  sleep 1
done

echo "ERROR: container did not become healthy" >&2
docker compose logs --tail 50 web >&2
exit 1
