#!/bin/bash
# ═══════════════════════════════════════════════════
# SouqChat — إعداد Secrets لـ Supabase Edge Functions
# الاستخدام: source .env && ./setup-secrets.sh PROJECT_REF
# ═══════════════════════════════════════════════════

PROJECT_REF="${1:-uwkdtbodoglbptiediea}"

echo "🔐 رفع Secrets لمشروع: $PROJECT_REF"
echo "══════════════════════════════════════"

supabase link --project-ref "$PROJECT_REF"

# ── Meta / WhatsApp (مطلوب) ──────────────────────
supabase secrets set \
  WA_ACCESS_TOKEN="${WA_ACCESS_TOKEN}" \
  META_TOKEN="${WA_ACCESS_TOKEN}" \
  WA_APP_SECRET="${WA_APP_SECRET}" \
  META_APP_SECRET="${WA_APP_SECRET}" \
  WA_BUSINESS_ID="${WA_BUSINESS_ID}" \
  META_BUSINESS_ID="${WA_BUSINESS_ID}" \
  WA_WEBHOOK_VERIFY_TOKEN="${WA_WEBHOOK_VERIFY_TOKEN}" \
  WHATSAPP_VERIFY_TOKEN="${WA_WEBHOOK_VERIFY_TOKEN}" \
  WA_API_VERSION="${WA_API_VERSION:-v24.0}" \
  META_API_VERSION="${WA_API_VERSION:-v24.0}"

echo "✅ Meta secrets done"

# ── AI Keys (مطلوب للشات بوت) ────────────────────
supabase secrets set \
  ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
  CHATBOT_AI_MODEL="${CHATBOT_AI_MODEL:-claude-haiku-4-5-20251001}" \
  CHATBOT_MAX_TOKENS="${CHATBOT_MAX_TOKENS:-500}" \
  CHATBOT_ENABLED="${CHATBOT_ENABLED:-true}"

echo "✅ AI secrets done"

# ── OpenAI (اختياري) ─────────────────────────────
if [ -n "${OPENAI_API_KEY:-}" ]; then
  supabase secrets set OPENAI_API_KEY="${OPENAI_API_KEY}"
  echo "✅ OpenAI secret done"
fi

# ── Gemini (اختياري) ─────────────────────────────
if [ -n "${GEMINI_API_KEY:-}" ]; then
  supabase secrets set \
    GEMINI_API_KEY="${GEMINI_API_KEY}" \
    GEMINI_MODEL="${GEMINI_MODEL:-gemini-1.5-flash}"
  echo "✅ Gemini secret done"
fi

# ── Cloudinary (اختياري) ─────────────────────────
if [ -n "${CLOUDINARY_URL:-}" ]; then
  supabase secrets set CLOUDINARY_URL="${CLOUDINARY_URL}"
  echo "✅ Cloudinary secret done"
fi

# ── Seafile (اختياري) ────────────────────────────
if [ -n "${SEAFILE_API_TOKEN:-}" ]; then
  supabase secrets set \
    SEAFILE_API_TOKEN="${SEAFILE_API_TOKEN}" \
    SEAFILE_URL="${SEAFILE_URL}" \
    SEAFILE_REPO_ID="${SEAFILE_REPO_ID}"
  echo "✅ Seafile secrets done"
fi

echo ""
echo "📋 جميع Secrets المحددة:"
supabase secrets list

echo ""
echo "✅ اكتمل إعداد Secrets!"
