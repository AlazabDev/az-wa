#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$ROOT/.env"
fail=0
ok(){ printf 'OK   %s\n' "$1"; }
bad(){ printf 'FAIL %s\n' "$1" >&2; fail=1; }
[[ "${META_GRAPH_VERSION:-}" == "v26.0" ]] && ok 'Graph API v26.0' || bad 'Graph API version'
[[ "${META_APP_COUNT:-0}" -gt 0 ]] && ok "Apps=$META_APP_COUNT" || bad 'No apps'
[[ "${META_TOKEN_COUNT:-0}" -gt 0 ]] && ok "Tokens=$META_TOKEN_COUNT" || bad 'No tokens'
for ((i=1;i<=META_APP_COUNT;i++)); do
  printf -v p 'META_APP_%02d_' "$i"
  for k in ID SECRET APP_ACCESS_TOKEN WEBHOOK_VERIFY_TOKEN SLUG NAME PLATFORM; do
    n="${p}${k}"; v="${!n:-}"
    [[ -n "$v" ]] || bad "$n empty"
  done
  n_id="${p}ID"; n_secret="${p}SECRET"; n_at="${p}APP_ACCESS_TOKEN"; n_vt="${p}WEBHOOK_VERIFY_TOKEN"
  [[ "${!n_id}" =~ ^[0-9]{12,20}$ ]] || bad "$n_id invalid"
  [[ "${!n_secret}" =~ ^[0-9a-fA-F]{32}$ ]] || bad "$n_secret invalid"
  expected="${!n_id}|${!n_secret}"; [[ "${!n_at}" == "$expected" ]] || bad "$n_at mismatch"
  vt="${!n_vt}"; [[ ${#vt} -ge 48 ]] || bad "$n_vt too short"
  ok "App $(printf '%02d' "$i") configured"
done
for ((i=1;i<=META_TOKEN_COUNT;i++)); do
  printf -v n 'META_TOKEN_%02d_VALUE' "$i"; v="${!n:-}"
  [[ "$v" == EAA* && ${#v} -gt 80 ]] || bad "$n invalid"
done
if grep -nE '^[A-Za-z_][A-Za-z0-9_]*=$|PUT_|CHANGE_ME|YOUR_|TODO|PLACEHOLDER' "$ROOT/.env" "$ROOT/meta_whatsapp.env" >/dev/null; then
  bad 'placeholder or empty assignment found'
else
  ok 'No placeholders / empty assignments in active env files'
fi
[[ $fail -eq 0 ]] || exit 1
ok 'Bundle secret/config validation passed'
