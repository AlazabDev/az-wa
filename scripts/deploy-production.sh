#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# SouqChat — Production Deploy Script (Enhanced)
# النشر الاحترافي للإنتاج الفعلي
# الاستخدام: ./deploy-production.sh [PROJECT_REF]
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ── الألوان ──────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GREEN}✅ $*${NC}"; }
err()  { echo -e "${RED}❌ $*${NC}"; exit 1; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
info() { echo -e "${BLUE}ℹ️  $*${NC}"; }
step() { echo -e "\n${BOLD}${CYAN}▶ $*${NC}"; }
line() { echo -e "${CYAN}══════════════════════════════════════════════${NC}"; }

# ── إعداد ────────────────────────────────────────────────────────
PROJECT_REF="${1:-$(grep 'project_id' supabase/config.toml 2>/dev/null | cut -d'"' -f2)}"

line
echo -e "${BOLD}  🚀 SouqChat — Production Deployment${NC}"
echo -e "     منصة واتساب للأعمال"
line

[ -z "$PROJECT_REF" ] && err "يجب تحديد PROJECT_REF\n   الاستخدام: ./deploy-production.sh uwkdtbodoglbptiediea"

info "Project: $PROJECT_REF"
info "Time:    $(date '+%Y-%m-%d %H:%M:%S')"

# ─────────────────────────────────────────────────────────────────
# STEP 0 — التحقق من المتطلبات الأساسية
# ─────────────────────────────────────────────────────────────────
step "STEP 0 — التحقق من المتطلبات"

command -v node &>/dev/null || err "Node.js غير مثبت (مطلوب 18+)"
command -v npm  &>/dev/null || err "npm غير مثبت"

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VERSION" -lt 18 ] && err "Node.js 18+ مطلوب — النسخة الحالية: $(node -v)"

# تثبيت أو تحديث Supabase CLI
if ! command -v supabase &>/dev/null; then
  info "تثبيت Supabase CLI..."
  npm install -g supabase@latest
else
  SUPA_VER=$(supabase --version 2>&1 | head -1)
  info "Supabase CLI: $SUPA_VER"
fi

ok "جميع المتطلبات متوفرة"

# ─────────────────────────────────────────────────────────────────
# STEP 1 — التحقق من Secrets المطلوبة
# ─────────────────────────────────────────────────────────────────
step "STEP 1 — التحقق من متغيرات البيئة الحرجة"

REQUIRED_SECRETS=(
  "WA_ACCESS_TOKEN"
  "WA_APP_SECRET"
  "WA_WEBHOOK_VERIFY_TOKEN"
  "ANTHROPIC_API_KEY"
  "SUPABASE_SERVICE_ROLE_KEY"
)

MISSING=0
for SECRET in "${REQUIRED_SECRETS[@]}"; do
  if [ -z "${!SECRET:-}" ]; then
    warn "غير موجود في البيئة: $SECRET"
    MISSING=$((MISSING + 1))
  else
    ok "$SECRET ✓"
  fi
done

if [ "$MISSING" -gt 0 ]; then
  warn "$MISSING متغير مفقود من البيئة المحلية."
  warn "تأكد أنها مضافة في: Supabase Dashboard → Settings → Edge Functions → Secrets"
  echo ""
  read -p "هل تريد المتابعة؟ (y/N): " CONTINUE
  [[ "$CONTINUE" != "y" && "$CONTINUE" != "Y" ]] && err "تم الإلغاء"
fi

# ─────────────────────────────────────────────────────────────────
# STEP 2 — الربط بمشروع Supabase
# ─────────────────────────────────────────────────────────────────
step "STEP 2 — الربط بمشروع Supabase"

supabase link --project-ref "$PROJECT_REF" || err "فشل الربط بالمشروع"
ok "تم الربط بـ $PROJECT_REF"

# ─────────────────────────────────────────────────────────────────
# STEP 3 — رفع Secrets إلى Supabase (اختياري)
# ─────────────────────────────────────────────────────────────────
step "STEP 3 — رفع Secrets إلى Supabase Edge Functions"

push_secret() {
  local KEY="$1"
  local VAL="${!KEY:-}"
  if [ -n "$VAL" ]; then
    echo "$VAL" | supabase secrets set "$KEY" --stdin 2>/dev/null && ok "Secret: $KEY" || warn "فشل رفع: $KEY"
  fi
}

# المتغيرات الأساسية
push_secret "WA_ACCESS_TOKEN"
push_secret "META_TOKEN"          # alias
push_secret "WA_APP_SECRET"
push_secret "META_APP_SECRET"     # alias
push_secret "WA_BUSINESS_ID"
push_secret "META_BUSINESS_ID"    # alias
push_secret "WA_WEBHOOK_VERIFY_TOKEN"
push_secret "WHATSAPP_VERIFY_TOKEN"  # alias
push_secret "WA_API_VERSION"

# AI Keys
push_secret "ANTHROPIC_API_KEY"
push_secret "OPENAI_API_KEY"
push_secret "GEMINI_API_KEY"

# Storage
push_secret "CLOUDINARY_URL"
push_secret "SEAFILE_API_TOKEN"
push_secret "SEAFILE_URL"
push_secret "SEAFILE_REPO_ID"

# Feature Flags
[ -n "${CHATBOT_ENABLED:-}" ] && \
  echo "$CHATBOT_ENABLED" | supabase secrets set CHATBOT_ENABLED --stdin 2>/dev/null

info "لرؤية جميع Secrets المحددة:"
info "supabase secrets list"

# ─────────────────────────────────────────────────────────────────
# STEP 4 — تشغيل Database Migrations
# ─────────────────────────────────────────────────────────────────
step "STEP 4 — تشغيل Database Migrations"

info "ترتيب الـ Migrations:"
MIGRATIONS=(
  "20260215095607_4dcf1e89-cfa8-4155-88a5-b0b304535596.sql"  # Schema الأساسي
  "20260215095634_ca415326-3cb6-4842-a306-30e7ae93df07.sql"
  "20260215102428_afcc8f38-189f-4357-bcb3-5e512b96fa47.sql"
  "20260221102107_e49d287b-d0cd-4b1a-ad88-8ecdc76f0fe5.sql"
  "20260305182231_10abc73c-b14a-49a0-ad3b-1387a8cc9975.sql"
  "20260310073005_7e77d10a-53c0-42be-b9a9-d446a895dc80.sql"
  "20260313030007_40566481-c013-4f0f-8f1e-4bfb6a5138e4.sql"
  "20260314180924_ba6e410b-b4b6-4fe0-9ec1-d12995119fe8.sql"
  "20260315100000_production_fix.sql"
  "20260324070000_phase2_chatbot.sql"
  "20260324093000_phase3_ai_vision.sql"
  "20260324094500_meta_accounts_alignment.sql"
  "20260324095000_add_ai_cache.sql"
  "20260324095700_add_ai_fields.sql"
)

for M in "${MIGRATIONS[@]}"; do
  echo "  → $M"
done

supabase db push --include-all 2>&1 | tee /tmp/db_push.log || {
  warn "فشل supabase db push — انظر /tmp/db_push.log"
  warn "يمكنك تشغيل الـ migrations يدوياً عبر Supabase SQL Editor"
  read -p "هل تريد المتابعة رغم ذلك؟ (y/N): " DB_CONT
  [[ "$DB_CONT" != "y" && "$DB_CONT" != "Y" ]] && err "تم الإلغاء"
}

ok "Migrations جاهزة"

# ─────────────────────────────────────────────────────────────────
# STEP 5 — نشر Edge Functions
# ─────────────────────────────────────────────────────────────────
step "STEP 5 — نشر Edge Functions (20 دالة)"

# ترتيب النشر مهم — الـ Webhooks أولاً ثم المعالجة ثم الخدمات
FUNCTIONS_ORDER=(
  # 1. نقطة دخول Meta Webhook
  "whatsapp_webhook"
  "wa_webhook_inbound"

  # 2. معالجة AI والشات بوت
  "chatbot_engine"
  "ai_auto_reply"
  "ai_vision"
  "ai_image_analyze"

  # 3. إرسال الرسائل والحملات
  "send_message"
  "broadcast_send"
  "worker_dispatch"

  # 4. مزامنة Meta
  "templates_sync"
  "meta_sync_all"

  # 5. إدارة الوسائط
  "media_signed_url"
  "media_delete"
  "media_sync_wa"
  "cloudinary_ops"
  "seafile_upload"

  # 6. الإدارة والتشخيص
  "api_keys_manage"
  "webhooks_manage"
  "diagnose_number"
  "provision_tenant"
)

DEPLOYED=0
FAILED=0
FAILED_FNS=()

for FN in "${FUNCTIONS_ORDER[@]}"; do
  printf "  → نشر %-30s" "$FN..."
  if supabase functions deploy "$FN" --no-verify-jwt 2>/tmp/fn_err.log; then
    echo -e "${GREEN}✓${NC}"
    DEPLOYED=$((DEPLOYED + 1))
  else
    echo -e "${RED}✗${NC}"
    FAILED=$((FAILED + 1))
    FAILED_FNS+=("$FN")
    cat /tmp/fn_err.log | head -3
  fi
done

echo ""
ok "تم نشر $DEPLOYED دالة بنجاح"
[ "$FAILED" -gt 0 ] && warn "فشل نشر $FAILED دالة: ${FAILED_FNS[*]}"

# ─────────────────────────────────────────────────────────────────
# STEP 6 — بناء الـ Frontend
# ─────────────────────────────────────────────────────────────────
step "STEP 6 — بناء الـ Frontend للإنتاج"

# تثبيت الحزم
info "تثبيت npm packages..."
npm ci --prefer-offline 2>/dev/null || npm install

# التحقق من وجود .env للـ Frontend
if [ ! -f ".env" ]; then
  warn "ملف .env غير موجود — سيتم استخدام المتغيرات من البيئة"
  # إنشاء .env مؤقت من المتغيرات الحالية
  {
    echo "VITE_SUPABASE_URL=https://${PROJECT_REF}.supabase.co"
    echo "VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY:-${VITE_SUPABASE_PUBLISHABLE_KEY:-}}"
    echo "VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY:-}"
    echo "VITE_APP_URL=${VITE_APP_URL:-https://your-domain.com}"
  } > .env.tmp
  warn "تم إنشاء .env.tmp — راجعه وعدّله قبل البناء"
fi

# بناء الإنتاج
info "بناء الـ Frontend..."
npm run build 2>&1 | tail -20

[ -d "dist" ] || err "فشل البناء — مجلد dist غير موجود"
BUILD_SIZE=$(du -sh dist/ 2>/dev/null | cut -f1)
ok "Frontend جاهز — الحجم: $BUILD_SIZE"

# ─────────────────────────────────────────────────────────────────
# STEP 7 — اختبار الـ Webhook
# ─────────────────────────────────────────────────────────────────
step "STEP 7 — اختبار Webhook Verification"

WEBHOOK_URL="https://${PROJECT_REF}.supabase.co/functions/v1/whatsapp_webhook"
VERIFY_TOKEN="${WA_WEBHOOK_VERIFY_TOKEN:-${WHATSAPP_VERIFY_TOKEN:-}}"

if [ -n "$VERIFY_TOKEN" ]; then
  info "اختبار GET verification..."
  RESPONSE=$(curl -s -o /tmp/webhook_resp.txt -w "%{http_code}" \
    "${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=SOUQCHAT_TEST_123" \
    --max-time 10 2>/dev/null || echo "000")

  if [ "$RESPONSE" = "200" ]; then
    BODY=$(cat /tmp/webhook_resp.txt)
    if [[ "$BODY" == *"SOUQCHAT_TEST_123"* ]]; then
      ok "Webhook Verification نجح ✓"
    else
      warn "الاستجابة 200 لكن الـ challenge غير صحيح: $BODY"
    fi
  else
    warn "فشل Webhook Verification — HTTP $RESPONSE"
    info "تحقق من Secrets في Supabase Dashboard"
  fi
else
  warn "WA_WEBHOOK_VERIFY_TOKEN غير محدد — تم تخطي اختبار Webhook"
fi

# ─────────────────────────────────────────────────────────────────
# STEP 8 — ملخص ما بعد النشر
# ─────────────────────────────────────────────────────────────────
step "STEP 8 — ملخص النشر"
line

echo -e "${BOLD}📌 روابط الإنتاج:${NC}"
echo -e "   Webhook URL:   ${CYAN}${WEBHOOK_URL}${NC}"
echo -e "   Supabase:      ${CYAN}https://app.supabase.com/project/${PROJECT_REF}${NC}"
echo -e "   Functions:     ${CYAN}https://app.supabase.com/project/${PROJECT_REF}/functions${NC}"
echo -e "   Database:      ${CYAN}https://app.supabase.com/project/${PROJECT_REF}/editor${NC}"

echo ""
echo -e "${BOLD}📋 الخطوات اليدوية المتبقية:${NC}"
echo ""
echo -e "  ${YELLOW}1. إعداد Meta Webhook:${NC}"
echo -e "     اذهب إلى → Meta for Developers → WhatsApp → Configuration"
echo -e "     Callback URL: ${CYAN}${WEBHOOK_URL}${NC}"
echo -e "     Verify Token:  \${WA_WEBHOOK_VERIFY_TOKEN}"
echo -e "     فعّل: messages, message_deliveries, message_reads"
echo ""
echo -e "  ${YELLOW}2. نشر الـ Frontend:${NC}"
echo -e "     Vercel:           ${CYAN}vercel --prod${NC}"
echo -e "     Netlify:          ${CYAN}netlify deploy --prod --dir dist${NC}"
echo -e "     Cloudflare Pages: ${CYAN}wrangler pages deploy dist${NC}"
echo ""
echo -e "  ${YELLOW}3. قائمة التحقق الأمني:${NC}"
echo -e "     ☐ META_APP_SECRET محدد (لتفعيل HMAC-SHA256)"
echo -e "     ☐ WA_WEBHOOK_VERIFY_TOKEN قوي (20+ حرف)"
echo -e "     ☐ ملف .env غير موجود في Git"
echo -e "     ☐ Row Level Security مفعّل على جميع الجداول"

echo ""
line
echo -e "${GREEN}${BOLD}✅ النشر اكتمل بنجاح!${NC}"
line

# ─────────────────────────────────────────────────────────────────
# سجّل النشر
# ─────────────────────────────────────────────────────────────────
{
  echo "==========================="
  echo "Deploy Log — $(date '+%Y-%m-%d %H:%M:%S')"
  echo "Project: $PROJECT_REF"
  echo "Deployed: $DEPLOYED functions"
  echo "Failed:   $FAILED functions"
  [ "$FAILED" -gt 0 ] && echo "Failed: ${FAILED_FNS[*]}"
  echo "==========================="
} >> deploy.log

ok "سجل النشر محفوظ في deploy.log"
