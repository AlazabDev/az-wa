#!/usr/bin/env bash
set -euo pipefail

META_TOKEN="${META_TOKEN:?Missing META_TOKEN}"
BUSINESS_ID="${BUSINESS_ID:-314437023701205}"
API="https://graph.facebook.com/${API_VERSION:-v24.0}"
OUT="${OUT:-meta_alazab_all.json}"

req () {
  curl -fsS "$1" -H "Authorization: Bearer $META_TOKEN"
}

jq -n '{ meta: {}, business: {}, wabas: [] }' > "$OUT"

req "$API/debug_token?input_token=$META_TOKEN&access_token=$META_TOKEN" \
| jq '.data' \
| jq '{meta: .}' \
| jq -s '.[0] * .[1]' "$OUT" - > /tmp/_tmp && mv /tmp/_tmp "$OUT"

req "$API/$BUSINESS_ID?fields=id,name,verification_status,created_time" \
| jq '{business: .}' \
| jq -s '.[0] * .[1]' "$OUT" - > /tmp/_tmp && mv /tmp/_tmp "$OUT"

WABAS=$(req "$API/$BUSINESS_ID/owned_whatsapp_business_accounts?limit=100")

for WABA_ID in $(echo "$WABAS" | jq -r '.data[].id'); do
  WABA_OBJ=$(jq -n '{id:"",info:{},phones:[],templates:[],apps:[],webhooks:[]}')
  WABA_OBJ=$(echo "$WABA_OBJ" | jq --arg id "$WABA_ID" '.id=$id')

  INFO=$(req "$API/$WABA_ID?fields=id,name,currency,timezone_id,message_template_namespace")
  WABA_OBJ=$(echo "$WABA_OBJ" | jq --argjson v "$INFO" '.info=$v')

  PHONES=$(req "$API/$WABA_ID/phone_numbers?limit=100")
  for PID in $(echo "$PHONES" | jq -r '.data[].id'); do
    P=$(req "$API/$PID?fields=id,display_phone_number,verified_name,quality_rating,status,account_mode,platform_type,throughput")
    WABA_OBJ=$(echo "$WABA_OBJ" | jq --argjson p "$P" '.phones += [$p]')
  done

  TPL=$(req "$API/$WABA_ID/message_templates?limit=250")
  WABA_OBJ=$(echo "$WABA_OBJ" | jq --argjson t "$TPL" '.templates=$t.data')

  APPS=$(req "$API/$WABA_ID/subscribed_apps")
  WABA_OBJ=$(echo "$WABA_OBJ" | jq --argjson a "$APPS" '.apps=$a.data')

  WH=$(req "$API/$WABA_ID/webhooks" || echo '{"data": []}')
  WABA_OBJ=$(echo "$WABA_OBJ" | jq --argjson w "$WH" '.webhooks=$w.data')

  jq --argjson w "$WABA_OBJ" '.wabas += [$w]' "$OUT" > /tmp/_tmp && mv /tmp/_tmp "$OUT"
done

echo "✅ DONE → $OUT"
