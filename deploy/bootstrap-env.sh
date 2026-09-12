#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${AZWA_ENV_FILE:-/etc/az-wa/az-wa.env}"
HISTORY="/etc/az-wa/history/$(date +%Y%m%d_%H%M%S)"
FORCE=false
[[ "${1:-}" == "--force" ]] && FORCE=true

if [[ -e "$TARGET" && "$FORCE" != true ]]; then
  echo "External environment already exists: $TARGET"
  echo "Use --force only when intentionally rebuilding it."
  exit 0
fi

[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "Run with sudo/root." >&2; exit 77; }
mkdir -p "$(dirname "$TARGET")" "$HISTORY" "$APP_DIR/_isolated_legacy/manifests"
chmod 700 "$(dirname "$TARGET")" "$HISTORY"

sources=()
for f in "$APP_DIR/.env.local" "$APP_DIR/.env" "$APP_DIR/meta/.env"; do
  [[ -f "$f" ]] && sources+=("$f")
done
((${#sources[@]})) || { echo "No existing application environment files found." >&2; exit 66; }

find_line() {
  local key="$1" file line
  for file in "${sources[@]}"; do
    line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" 2>/dev/null | tail -n1 || true)"
    if [[ -n "$line" ]]; then
      line="${line#export }"
      printf '%s\n' "$line"
      return 0
    fi
  done
  return 1
}

keys=(
  NODE_ENV HOST PORT
  SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY
  VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY
  AZWA_CRON_SECRET AZWA_CRON_SECRET_PREVIOUS
  META_GRAPH_VERSION META_WEBHOOK_PUBLIC_URL META_APP_ID META_SYSTEM_USER_TOKEN
  MINIO_ENDPOINT MINIO_ACCESS_KEY MINIO_SECRET_KEY MINIO_BUCKET_NAME MINIO_BUCKET MINIO_REGION
  SUPABASE_DB_URL DATABASE_URL
)

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
printf '# AzWA production environment — generated from existing server state\n' > "$tmp"
printf 'NODE_ENV=production\nHOST=127.0.0.1\nPORT=8085\n' >> "$tmp"
for key in "${keys[@]}"; do
  case "$key" in NODE_ENV|HOST|PORT) continue ;; esac
  find_line "$key" >> "$tmp" || true
done

# Derive browser-safe Supabase variables if the legacy server only had server names.
if ! grep -q '^VITE_SUPABASE_URL=' "$tmp"; then
  line="$(grep '^SUPABASE_URL=' "$tmp" | tail -n1 || true)"; [[ -n "$line" ]] && printf 'VITE_SUPABASE_URL=%s\n' "${line#*=}" >> "$tmp"
fi
if ! grep -q '^VITE_SUPABASE_PUBLISHABLE_KEY=' "$tmp"; then
  line="$(grep '^SUPABASE_PUBLISHABLE_KEY=' "$tmp" | tail -n1 || true)"; [[ -n "$line" ]] && printf 'VITE_SUPABASE_PUBLISHABLE_KEY=%s\n' "${line#*=}" >> "$tmp"
fi
grep -q '^META_GRAPH_VERSION=' "$tmp" || printf 'META_GRAPH_VERSION=v24.0\n' >> "$tmp"
grep -q '^META_WEBHOOK_PUBLIC_URL=' "$tmp" || printf 'META_WEBHOOK_PUBLIC_URL=https://wa.alazab.com/webhooks/meta/whatsapp\n' >> "$tmp"
grep -q '^MINIO_BUCKET_NAME=' "$tmp" || printf 'MINIO_BUCKET_NAME=az-bk-whatsapp\n' >> "$tmp"
grep -q '^MINIO_REGION=' "$tmp" || printf 'MINIO_REGION=us-east-1\n' >> "$tmp"

install -m 600 "$tmp" "$TARGET"

manifest="$APP_DIR/_isolated_legacy/manifests/SERVER_ENV_MIGRATION_$(date +%Y%m%d_%H%M%S).sha256"
: > "$manifest"
for file in "${sources[@]}"; do
  sha256sum "$file" >> "$manifest"
  rel="$(printf '%s' "$file" | sed 's#^/##; s#/#_#g')"
  mv "$file" "$HISTORY/$rel"
  chmod 600 "$HISTORY/$rel"
done
chmod 600 "$manifest"

echo "AzWA environment migrated to $TARGET"
echo "Historical raw environment files preserved outside the web application under $HISTORY"
echo "No secret values were printed."
