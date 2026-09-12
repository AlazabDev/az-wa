#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

DOMAIN="wa.alazab.com"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${AZWA_ENV_FILE:-/etc/az-wa/az-wa.env}"
PM2_CONFIG="$APP_DIR/deploy/ecosystem.config.cjs"
NGINX_SRC="$APP_DIR/deploy/nginx/wa.alazab.com"
NGINX_DEST="/etc/nginx/sites-available/wa.alazab.com"
ARCHIVE_ROOT="$APP_DIR/_isolated_legacy/build-artifacts"
EXPECTED_LOCK_BLOB="9d9a8c3c0f84ef7b4604e9b7a66925d1d554ecab"
DO_MIGRATE=false
DO_NGINX=false
ARCHIVE_EXTRA=false

for arg in "$@"; do
  case "$arg" in
    --apply-migrations|--migrate) DO_MIGRATE=true ;;
    --sync-nginx|--nginx) DO_NGINX=true ;;
    --archive-build|--clean) ARCHIVE_EXTRA=true ;;
    -h|--help)
      echo "Usage: $0 [--apply-migrations] [--sync-nginx] [--archive-build]"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 64 ;;
  esac
done

log(){ printf '\n==> %s\n' "$*"; }
fail(){ printf '\nERROR: %s\n' "$*" >&2; exit 1; }

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "$HOME/.nvm/nvm.sh"
  nvm use 24 >/dev/null 2>&1 || true
fi
for cmd in node npm git curl; do command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is required"; done
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
[[ "$NODE_MAJOR" -ge 24 ]] || fail "Node.js 24+ required; found $(node -v)"

PM2_BIN="$(command -v pm2 2>/dev/null || true)"
[[ -n "$PM2_BIN" ]] || fail "PM2 is required; install it deliberately before deployment"
[[ -f "$ENV_FILE" ]] || fail "Missing $ENV_FILE. Run: sudo ./deploy/migrate-secrets.sh"
case "$(stat -c '%a' "$ENV_FILE")" in 600|640|400|440) ;; *) fail "Unsafe env permissions on $ENV_FILE" ;; esac

cd "$APP_DIR"
[[ -f package-lock.json ]] || fail "package-lock.json is required. Keep the exact lock from commit 181b5f44c02da035967e92c0f3af5f98981a7144 on the server before deploying."
LOCK_BLOB="$(git hash-object package-lock.json)"
[[ "$LOCK_BLOB" == "$EXPECTED_LOCK_BLOB" ]] || fail "Unexpected package-lock.json blob: $LOCK_BLOB (expected $EXPECTED_LOCK_BLOB)"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
export NODE_ENV=production HOST=127.0.0.1 PORT=8085 NITRO_PRESET=node-server
export VITE_ENABLE_LEGACY_UI=false VITE_ENABLE_PREVIEW_AUTH=false
: "${VITE_SUPABASE_URL:=${SUPABASE_URL:-}}"
: "${VITE_SUPABASE_PUBLISHABLE_KEY:=${SUPABASE_PUBLISHABLE_KEY:-}}"
export VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY

required=(SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY AZWA_CRON_SECRET META_GRAPH_VERSION META_WEBHOOK_PUBLIC_URL MINIO_ENDPOINT MINIO_ACCESS_KEY MINIO_SECRET_KEY)
missing=()
for name in "${required[@]}"; do [[ -n "${!name:-}" ]] || missing+=("$name"); done
((${#missing[@]}==0)) || { printf 'Missing required variables:\n' >&2; printf ' - %s\n' "${missing[@]}" >&2; exit 78; }
[[ "$SUPABASE_URL" == "https://huohlaqhqsiamzcsglrg.supabase.co" ]] || fail "Unexpected production Supabase URL"
[[ "$META_WEBHOOK_PUBLIC_URL" == "https://wa.alazab.com/webhooks/meta/whatsapp" ]] || fail "Unexpected META_WEBHOOK_PUBLIC_URL"

log "Static production gates"
node scripts/production-preflight.mjs
node --test scripts/production-guards.test.mjs
node scripts/security-scan.mjs

log "Deterministic dependency installation"
npm ci --no-audit --no-fund

mkdir -p "$ARCHIVE_ROOT"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$ARCHIVE_ROOT/$STAMP"
BACKUP_OUTPUT=""
DEPLOY_OK=false
RUNTIME_RELOADED=false
rollback(){
  code=$?
  [[ "$DEPLOY_OK" == true ]] && return 0
  printf '\nDeployment failed (exit %s). Preserving failed build and restoring previous artifact.\n' "$code" >&2
  if [[ -d "$APP_DIR/.output" ]]; then
    mkdir -p "$APP_DIR/_isolated_legacy/failed-builds/$STAMP"
    mv "$APP_DIR/.output" "$APP_DIR/_isolated_legacy/failed-builds/$STAMP/.output" || true
  fi
  if [[ -n "$BACKUP_OUTPUT" && -d "$BACKUP_OUTPUT" ]]; then
    mv "$BACKUP_OUTPUT" "$APP_DIR/.output" || true
    [[ "$RUNTIME_RELOADED" == true ]] && "$PM2_BIN" startOrReload "$PM2_CONFIG" --update-env || true
  fi
  exit "$code"
}
trap rollback ERR

if [[ -d .output ]]; then
  mkdir -p "$BACKUP_DIR"
  mv .output "$BACKUP_DIR/.output"
  BACKUP_OUTPUT="$BACKUP_DIR/.output"
fi
if [[ "$ARCHIVE_EXTRA" == true ]]; then
  for dir in .tanstack .nitro .vinxi dist; do
    [[ -e "$dir" ]] || continue
    mkdir -p "$BACKUP_DIR"
    mv "$dir" "$BACKUP_DIR/$dir"
  done
fi

log "Production Node build"
NITRO_PRESET=node-server npm run build
[[ -f .output/server/index.mjs ]] || fail "Missing .output/server/index.mjs"
! grep -q "routes/legacy" src/routeTree.gen.ts || fail "Generated route tree still exposes legacy routes"
grep -q "_authenticated/files" src/routeTree.gen.ts || fail "Generated route tree does not contain /files"

log "TypeScript / lint / regression / security validation"
npm run typecheck
npm run lint
npm run test
npm run security:scan

if [[ "$DO_MIGRATE" == true ]]; then
  command -v supabase >/dev/null 2>&1 || fail "Supabase CLI is required for --apply-migrations"
  DB_URL="${SUPABASE_DB_URL:-${DATABASE_URL:-}}"
  [[ -n "$DB_URL" ]] || fail "SUPABASE_DB_URL or DATABASE_URL is required to apply migrations"
  log "Migration dry run"
  supabase db push --db-url "$DB_URL" --dry-run
  log "Applying forward-only migrations"
  supabase db push --db-url "$DB_URL"
fi

if [[ "$DO_NGINX" == true ]]; then
  command -v nginx >/dev/null 2>&1 || fail "Nginx is required for --sync-nginx"
  log "Syncing canonical Nginx config"
  sudo install -m 644 "$NGINX_SRC" "$NGINX_DEST"
  sudo ln -sfn "$NGINX_DEST" /etc/nginx/sites-enabled/wa.alazab.com
  sudo nginx -t
  sudo systemctl reload nginx
fi

# Do not terminate an unknown current runtime automatically. The first cut-over from
# a manually/system-managed Node process to PM2 must be deliberate.
if command -v ss >/dev/null 2>&1 && ss -lntp 2>/dev/null | grep -q '127.0.0.1:8085'; then
  if ! "$PM2_BIN" jlist 2>/dev/null | grep -q '"name":"azwa-app"'; then
    fail "Port 8085 is already owned by a non-PM2 runtime. Preserve service availability, identify/stop its supervisor deliberately, then rerun deploy."
  fi
fi

log "PM2 start/reload"
"$PM2_BIN" startOrReload "$PM2_CONFIG" --update-env
RUNTIME_RELOADED=true
"$PM2_BIN" save --force

probe(){ curl --fail --silent --show-error --retry 12 --retry-delay 2 --max-time 15 "$1" >/dev/null; }
log "Health gates"
probe http://127.0.0.1:8085/healthz
probe http://127.0.0.1:8085/readyz
probe https://wa.alazab.com/healthz
probe https://wa.alazab.com/readyz

DEPLOY_OK=true
trap - ERR
log "Deployment verified: https://$DOMAIN"
"$PM2_BIN" status azwa-app
