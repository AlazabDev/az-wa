#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="wa.alazab.com"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NGINX_CONF_SRC="${APP_DIR}/deploy/nginx/wa.alazab.com"
NGINX_CONF_DEST="/etc/nginx/sites-available/wa.alazab.com"
NGINX_CONF_LINK="/etc/nginx/sites-enabled/wa.alazab.com"
PM2_CONFIG="${APP_DIR}/deploy/ecosystem.config.cjs"
CLEAN_DEPLOY=false

if [[ "${1:-}" == "--clean" ]]; then
  CLEAN_DEPLOY=true
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--clean]" >&2
  exit 64
fi

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

cd "${APP_DIR}"

command -v node >/dev/null 2>&1 || fail "Node.js is required"
command -v bun >/dev/null 2>&1 || fail "Bun is required for the production lockfile"
command -v nginx >/dev/null 2>&1 || fail "Nginx is required"

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
[[ "${NODE_MAJOR}" -ge 24 ]] || fail "Node.js 24+ is required; found $(node -v)"

[[ -f "${APP_DIR}/.env" ]] || fail "Missing ${APP_DIR}/.env"
chmod 600 "${APP_DIR}/.env"
set -a
# shellcheck disable=SC1091
source "${APP_DIR}/.env"
set +a

required_env=(
  SUPABASE_URL
  SUPABASE_PUBLISHABLE_KEY
  SUPABASE_SERVICE_ROLE_KEY
  VITE_SUPABASE_URL
  VITE_SUPABASE_PUBLISHABLE_KEY
  VITE_SUPABASE_PROJECT_ID
  AZWA_CRON_SECRET
  META_GRAPH_VERSION
  META_WEBHOOK_PUBLIC_URL
  MINIO_ENDPOINT
  MINIO_ACCESS_KEY
  MINIO_SECRET_KEY
)

missing=()
for name in "${required_env[@]}"; do
  [[ -n "${!name:-}" ]] || missing+=("${name}")
done
if ((${#missing[@]})); then
  printf 'Missing required production variables:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 78
fi

if [[ "${CLEAN_DEPLOY}" == "true" ]]; then
  log "Removing previous AzWA runtime deployment"

  if command -v pm2 >/dev/null 2>&1; then
    pm2 delete azwa-app >/dev/null 2>&1 || true
    pm2 delete az-wa >/dev/null 2>&1 || true
    pm2 save --force >/dev/null 2>&1 || true
  fi

  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl disable --now az-wa.service >/dev/null 2>&1 || true
    sudo rm -f /etc/systemd/system/az-wa.service
    sudo systemctl daemon-reload >/dev/null 2>&1 || true
  fi

  # Remove only known legacy AzWA Nginx site names. Keep the canonical site path.
  sudo rm -f \
    /etc/nginx/sites-enabled/az-wa \
    /etc/nginx/sites-available/az-wa \
    /etc/nginx/sites-enabled/az-wa.conf \
    /etc/nginx/sites-available/az-wa.conf \
    /etc/nginx/sites-enabled/wa.alazab.com.conf \
    /etc/nginx/sites-available/wa.alazab.com.conf

  rm -rf \
    "${APP_DIR}/node_modules" \
    "${APP_DIR}/.output" \
    "${APP_DIR}/.tanstack" \
    "${APP_DIR}/.vinxi" \
    "${APP_DIR}/.nitro"
fi

log "Installing locked dependencies"
bun install --frozen-lockfile

log "Building and validating application"
bun run build
bun run typecheck
bun run lint

log "Installing canonical Nginx site"
sudo cp "${NGINX_CONF_SRC}" "${NGINX_CONF_DEST}"
sudo ln -sfn "${NGINX_CONF_DEST}" "${NGINX_CONF_LINK}"
sudo nginx -t
sudo systemctl reload nginx

if command -v certbot >/dev/null 2>&1; then
  log "Ensuring TLS certificate for ${DOMAIN}"
  sudo certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --redirect --register-unsafely-without-email || true
  sudo nginx -t
  sudo systemctl reload nginx
fi

if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing PM2"
  sudo npm install -g pm2
fi

log "Starting fresh PM2 runtime"
if [[ "${CLEAN_DEPLOY}" == "true" ]]; then
  pm2 start "${PM2_CONFIG}" --update-env
else
  pm2 startOrReload "${PM2_CONFIG}" --update-env
fi
pm2 save --force

log "Running local health gates"
curl --fail --silent --show-error --retry 12 --retry-delay 2 "http://127.0.0.1:8085/healthz" >/dev/null
curl --fail --silent --show-error --retry 12 --retry-delay 2 "http://127.0.0.1:8085/readyz" >/dev/null

log "Running public health gates"
curl --fail --silent --show-error --retry 6 --retry-delay 2 "https://${DOMAIN}/healthz" >/dev/null
curl --fail --silent --show-error --retry 6 --retry-delay 2 "https://${DOMAIN}/readyz" >/dev/null

log "Probing runtime queues including Milano media worker"
curl --fail --silent --show-error \
  --request POST \
  --header "Authorization: Bearer ${AZWA_CRON_SECRET}" \
  "https://${DOMAIN}/api/public/jobs/runtime?webhooks=5&messages=1&media=5" >/dev/null

log "Deployment complete: https://${DOMAIN}"
pm2 status azwa-app
