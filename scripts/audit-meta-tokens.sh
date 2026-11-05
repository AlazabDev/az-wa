#!/usr/bin/env bash

set -u

API="https://graph.facebook.com/v25.0"
BUSINESS_ID="314437023701205"

TOKENS=(
  "UBERFIX:META_UF_TOKEN"
  "ALAZAB_GROUP:META_AG_TOKEN"
  "ALAZAB_APP:META_AA_TOKEN"
  "AZAB_SERVER:META_AS_TOKEN"
  "LABAN_ALASFOUR:META_LA_TOKEN"
  "AZ-WA:META_WA_TOKEN"
  "BRAND_IDENTITY:META_BI_TOKEN"
)

OUT="meta-token-audit-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

printf "LABEL\tVARIABLE\tUSER_ID\tUSER_NAME\tAPP_ID\tAPP_NAME\tBUSINESS_MANAGEMENT\tWA_MANAGEMENT\tWA_MESSAGING\n" \
  > "$OUT/summary.tsv"

for ENTRY in "${TOKENS[@]}"; do

  LABEL="${ENTRY%%:*}"
  VAR="${ENTRY##*:}"
  TOKEN="${!VAR:-}"

  echo
  echo "================================================================"
  echo "$LABEL / $VAR"
  echo "================================================================"

  if [ -z "$TOKEN" ]; then
    echo "TOKEN NOT SET"
    continue
  fi

  mkdir -p "$OUT/$LABEL"

  echo "--- TOKEN LENGTH ---"
  echo "${#TOKEN}"

  echo
  echo "--- /me ---"

  curl -sS -G \
    "$API/me" \
    -H "Authorization: Bearer $TOKEN" \
    --data-urlencode "fields=id,name" \
    | tee "$OUT/$LABEL/me.json" \
    | jq .

  echo
  echo "--- APP ---"

  curl -sS -G \
    "$API/app" \
    -H "Authorization: Bearer $TOKEN" \
    --data-urlencode "fields=id,name" \
    | tee "$OUT/$LABEL/app.json" \
    | jq .

  echo
  echo "--- PERMISSIONS ---"

  curl -sS -G \
    "$API/me/permissions" \
    -H "Authorization: Bearer $TOKEN" \
    | tee "$OUT/$LABEL/permissions.json" \
    | jq .

  echo
  echo "--- BUSINESS ---"

  curl -sS -G \
    "$API/$BUSINESS_ID" \
    -H "Authorization: Bearer $TOKEN" \
    --data-urlencode "fields=id,name" \
    | tee "$OUT/$LABEL/business.json" \
    | jq .

  echo
  echo "--- OWNED WABAs ---"

  curl -sS -G \
    "$API/$BUSINESS_ID/owned_whatsapp_business_accounts" \
    -H "Authorization: Bearer $TOKEN" \
    --data-urlencode "fields=id,name" \
    --data-urlencode "limit=100" \
    | tee "$OUT/$LABEL/owned-wabas.json" \
    | jq .

  echo
  echo "--- CLIENT WABAs ---"

  curl -sS -G \
    "$API/$BUSINESS_ID/client_whatsapp_business_accounts" \
    -H "Authorization: Bearer $TOKEN" \
    --data-urlencode "fields=id,name" \
    --data-urlencode "limit=100" \
    | tee "$OUT/$LABEL/client-wabas.json" \
    | jq .

  USER_ID="$(jq -r '.id // ""' "$OUT/$LABEL/me.json")"
  USER_NAME="$(jq -r '.name // ""' "$OUT/$LABEL/me.json")"

  APP_ID="$(jq -r '.id // ""' "$OUT/$LABEL/app.json")"
  APP_NAME="$(jq -r '.name // ""' "$OUT/$LABEL/app.json")"

  BM="$(jq -r '[.data[]? | select(.permission=="business_management" and .status=="granted")] | length' "$OUT/$LABEL/permissions.json")"
  WAM="$(jq -r '[.data[]? | select(.permission=="whatsapp_business_management" and .status=="granted")] | length' "$OUT/$LABEL/permissions.json")"
  WAMS="$(jq -r '[.data[]? | select(.permission=="whatsapp_business_messaging" and .status=="granted")] | length' "$OUT/$LABEL/permissions.json")"

  printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n" \
    "$LABEL" "$VAR" "$USER_ID" "$USER_NAME" "$APP_ID" "$APP_NAME" "$BM" "$WAM" "$WAMS" \
    >> "$OUT/summary.tsv"

done

echo
echo "================================================================"
echo "SUMMARY"
echo "================================================================"

column -t -s $'\t' "$OUT/summary.tsv" 2>/dev/null || cat "$OUT/summary.tsv"

echo
echo "Audit folder:"
echo "$OUT"
