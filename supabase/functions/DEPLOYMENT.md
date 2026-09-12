# 🚀 دليل النشر للإنتاج — SouqChat WhatsApp Platform

## نظرة عامة على البنية

```
Frontend (React/Vite)  →  Supabase Edge Functions (Deno)  →  Meta WhatsApp Cloud API
                       ↕
                   PostgreSQL + Realtime + Storage
```

---

## الخطوة 1 — إعداد Supabase

1. أنشئ مشروعاً جديداً على [supabase.com](https://supabase.com)
2. احفظ **Project URL** و **Anon Key** من `Settings → API`
3. انسخ `.env.production.example` إلى `.env` وأكمل القيم

---

## الخطوة 2 — تشغيل Migrations

```bash
# تثبيت Supabase CLI
npm install -g supabase

supabase login
supabase link --project-ref YOUR_PROJECT_REF

# تشغيل جميع الـ migrations بالترتيب الصحيح
supabase db push
```

أو يدوياً في **Supabase Dashboard → SQL Editor** بترتيب أسماء الملفات.

### ترتيب الـ Migrations:

```
20260215095607_*.sql   ← الجداول الأساسية
20260215095634_*.sql
20260215102428_*.sql
20260221102107_*.sql
20260305182231_*.sql
20260310073005_*.sql
20260313030007_*.sql
20260314180924_*.sql
20260315100000_production_fix.sql
20260324070000_phase2_chatbot.sql
20260324093000_phase3_ai_vision.sql
20260324094500_meta_accounts_alignment.sql
20260324095000_add_ai_cache.sql
20260324095700_add_ai_fields.sql
```

---

## الخطوة 3 — إعداد Secrets في Supabase Edge Functions

اذهب إلى **Supabase → Settings → Edge Functions → Secrets** وأضف:

| المتغير                   | الوصف                                                               |
| ------------------------- | ------------------------------------------------------------------- |
| `META_TOKEN`              | Access Token من Meta Business Manager                               |
| `WA_ACCESS_TOKEN`         | نفس قيمة META_TOKEN                                                 |
| `META_APP_SECRET`         | App Secret من Meta → App Settings → Basic                           |
| `WA_APP_SECRET`           | نفس قيمة META_APP_SECRET                                            |
| `WHATSAPP_VERIFY_TOKEN`   | رمز سري تختاره أنت (نص عشوائي قوي)                                  |
| `WA_WEBHOOK_VERIFY_TOKEN` | نفس قيمة WHATSAPP_VERIFY_TOKEN                                      |
| `ANTHROPIC_API_KEY`       | مفتاح API من [console.anthropic.com](https://console.anthropic.com) |
| `OPENAI_API_KEY`          | مفتاح API من OpenAI (إن استُخدم)                                    |
| `GEMINI_API_KEY`          | مفتاح API من Google AI Studio (إن استُخدم)                          |
| `CHATBOT_ENABLED`         | `true` أو `false`                                                   |
| `AI_VISION_ENABLED`       | `true` أو `false`                                                   |
| `CLOUDINARY_URL`          | رابط Cloudinary بالصيغة cloudinary://key:secret@cloud               |
| `SEAFILE_API_TOKEN`       | Token من Seafile (إن استُخدم)                                       |
| `SEAFILE_URL`             | رابط خادم Seafile                                                   |
| `SEAFILE_REPO_ID`         | معرّف المستودع في Seafile                                           |

> ⚠️ **لا تضع هذه القيم في الكود أو تشاركها في Git أبداً**

---

## الخطوة 4 — نشر Edge Functions

```bash
# نشر جميع الدوال (بالترتيب المقترح)

# أولاً: Webhook الرئيسي
supabase functions deploy whatsapp_webhook --no-verify-jwt
supabase functions deploy wa_webhook_inbound --no-verify-jwt

# ثانياً: المعالجة الأساسية
supabase functions deploy chatbot_engine --no-verify-jwt
supabase functions deploy ai_auto_reply --no-verify-jwt
supabase functions deploy ai_vision --no-verify-jwt
supabase functions deploy ai_image_analyze --no-verify-jwt

# ثالثاً: الرسائل والإرسال
supabase functions deploy send_message --no-verify-jwt
supabase functions deploy broadcast_send --no-verify-jwt
supabase functions deploy worker_dispatch --no-verify-jwt

# رابعاً: الميزات الأخرى
supabase functions deploy templates_sync --no-verify-jwt
supabase functions deploy meta_sync_all --no-verify-jwt
supabase functions deploy media_signed_url --no-verify-jwt
supabase functions deploy media_delete --no-verify-jwt
supabase functions deploy media_sync_wa --no-verify-jwt
supabase functions deploy api_keys_manage --no-verify-jwt
supabase functions deploy webhooks_manage --no-verify-jwt
supabase functions deploy cloudinary_ops --no-verify-jwt
supabase functions deploy seafile_upload --no-verify-jwt
supabase functions deploy diagnose_number --no-verify-jwt
supabase functions deploy provision_tenant --no-verify-jwt
```

### نشر جميع الدوال دفعة واحدة:

```bash
for fn in whatsapp_webhook wa_webhook_inbound chatbot_engine ai_auto_reply \
          ai_vision ai_image_analyze send_message broadcast_send worker_dispatch \
          templates_sync meta_sync_all media_signed_url media_delete media_sync_wa \
          api_keys_manage webhooks_manage cloudinary_ops seafile_upload \
          diagnose_number provision_tenant; do
  echo "Deploying $fn..."
  supabase functions deploy $fn --no-verify-jwt
done
```

---

## الخطوة 5 — إعداد Webhook في Meta

1. اذهب إلى **Meta for Developers → WhatsApp → Configuration**
2. في **Callback URL**:
   ```
   https://YOUR_PROJECT_REF.supabase.co/functions/v1/whatsapp_webhook
   ```
3. في **Verify Token**: ضع نفس قيمة `WHATSAPP_VERIFY_TOKEN`
4. فعّل هذه **Webhook Fields**:
   - ✅ `messages`
   - ✅ `message_deliveries`
   - ✅ `message_reads`

### اختبار التحقق:

```bash
curl "https://YOUR_PROJECT_REF.supabase.co/functions/v1/whatsapp_webhook\
?hub.mode=subscribe\
&hub.verify_token=YOUR_VERIFY_TOKEN\
&hub.challenge=test_challenge_123"
# يجب أن يرد: test_challenge_123
```

---

## الخطوة 6 — بناء ونشر الـ Frontend

```bash
# تثبيت الحزم
npm install

# بناء للإنتاج
npm run build

# المجلد dist/ جاهز للرفع على:
# Vercel:
vercel --prod

# Netlify:
netlify deploy --prod --dir dist

# Cloudflare Pages:
wrangler pages deploy dist
```

---

## قائمة التحقق قبل الإطلاق ✅

### الأمان

- [ ] `.env` غير موجود في Git
- [ ] `META_APP_SECRET` مُعيَّن (لتفعيل HMAC-SHA256)
- [ ] `WHATSAPP_VERIFY_TOKEN` قوي وعشوائي (20+ حرف)
- [ ] Row Level Security (RLS) مُفعَّل على جميع الجداول

### قاعدة البيانات

- [ ] جميع الـ 14 migration شُغِّلت بالترتيب الصحيح
- [ ] لا توجد أخطاء في SQL Editor بعد التشغيل

### Edge Functions

- [ ] جميع الـ 20 دالة منشورة
- [ ] جميع الـ Secrets مُعيَّنة في Supabase Dashboard

### الاتصال

- [ ] اختبار GET verification للـ Webhook نجح
- [ ] اختبار استقبال رسالة نجح
- [ ] Meta Webhook Fields مُفعَّلة (messages, deliveries, reads)

---

## مراقبة الإنتاج

- **Supabase → Edge Functions → Logs**: مراقبة الأخطاء في الوقت الفعلي
- **Meta Business Manager → Webhooks**: نسبة النجاح يجب أن تكون > 99%
- **Supabase → Database → Table Editor**: مراقبة بيانات الرسائل
