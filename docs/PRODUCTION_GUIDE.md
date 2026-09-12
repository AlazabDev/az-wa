# 🚀 SouqChat — دليل النشر الشامل للإنتاج الفعلي

## نظرة عامة على المشروع

**SouqChat** منصة واتساب للأعمال متكاملة مبنية على:

- **Frontend**: React 18 + Vite + Tailwind + shadcn/ui
- **Backend**: Supabase (PostgreSQL + Edge Functions Deno + Realtime)
- **AI**: Claude (Anthropic) + Gemini + OpenAI
- **Meta**: WhatsApp Cloud API v24.0
- **Storage**: Cloudinary + Seafile
- **Mobile**: Capacitor (Android)

---

## 📐 معمارية النظام

```
المستخدم (Browser/Android)
        │
        ▼
React Frontend (Vercel/Netlify)
        │
        ▼
Supabase (Auth + Realtime + DB)
        │
        ├──► PostgreSQL (RLS محمية)
        │
        └──► Edge Functions (Deno)
                    │
                    ├──► whatsapp_webhook ◄─── Meta Webhook (inbound)
                    ├──► wa_webhook_inbound
                    ├──► chatbot_engine ──────► Claude AI
                    ├──► ai_auto_reply
                    ├──► ai_vision ───────────► Gemini Vision
                    ├──► ai_image_analyze
                    ├──► send_message ────────► Meta Graph API (outbound)
                    ├──► broadcast_send
                    ├──► worker_dispatch
                    ├──► templates_sync
                    ├──► meta_sync_all
                    ├──► media_signed_url ────► Cloudinary / Seafile
                    ├──► media_delete
                    ├──► media_sync_wa
                    ├──► cloudinary_ops
                    ├──► seafile_upload
                    ├──► api_keys_manage
                    ├──► webhooks_manage
                    ├──► diagnose_number
                    └──► provision_tenant
```

---

## 🗄️ قاعدة البيانات

### الجداول الرئيسية (14 migration)

| الجدول           | الوصف                                          |
| ---------------- | ---------------------------------------------- |
| `tenants`        | المستأجرون (Multi-tenant)                      |
| `profiles`       | ملفات المستخدمين                               |
| `tenant_members` | أعضاء كل مستأجر بأدوار (admin/operator/viewer) |
| `wa_accounts`    | حسابات WABA                                    |
| `wa_numbers`     | أرقام واتساب المتصلة                           |
| `contacts`       | جهات الاتصال                                   |
| `conversations`  | المحادثات                                      |
| `messages`       | الرسائل (inbound/outbound)                     |
| `templates`      | قوالب الرسائل                                  |
| `media_files`    | الوسائط                                        |
| `media_folders`  | مجلدات تنظيم الوسائط                           |
| `chatbot_rules`  | قواعد الشات بوت                                |
| `api_keys`       | مفاتيح API الخارجية                            |
| `audit_logs`     | سجل التدقيق                                    |
| `worker_jobs`    | قائمة المهام                                   |

### أمان قاعدة البيانات

- ✅ Row Level Security (RLS) على جميع الجداول
- ✅ دوال `is_tenant_member()` و `has_tenant_role()` للتحقق
- ✅ أدوار: `admin`, `operator`, `viewer`

---

## ⚙️ خطوات النشر الكاملة

### الخطوة 1 — إعداد Supabase

```bash
# تثبيت Supabase CLI
npm install -g supabase@latest

# تسجيل الدخول
supabase login

# ربط المشروع
supabase link --project-ref uwkdtbodoglbptiediea
```

### الخطوة 2 — تشغيل Migrations

```bash
# تشغيل جميع الـ 14 migration
supabase db push --include-all
```

**أو يدوياً في SQL Editor بهذا الترتيب:**

1. `20260215095607_*.sql` ← Schema الأساسي
2. `20260215095634_*.sql`
3. `20260215102428_*.sql`
4. `20260221102107_*.sql`
5. `20260305182231_*.sql`
6. `20260310073005_*.sql`
7. `20260313030007_*.sql`
8. `20260314180924_*.sql`
9. `20260315100000_production_fix.sql` ← **حرج: أعمدة مفقودة وإصلاحات**
10. `20260324070000_phase2_chatbot.sql`
11. `20260324093000_phase3_ai_vision.sql`
12. `20260324094500_meta_accounts_alignment.sql`
13. `20260324095000_add_ai_cache.sql`
14. `20260324095700_add_ai_fields.sql`

### الخطوة 3 — إعداد Secrets في Supabase

**Supabase Dashboard → Settings → Edge Functions → Secrets**

أو عبر CLI:

```bash
# تشغيل سكريبت الإعداد
source .env
./setup-secrets.sh uwkdtbodoglbptiediea
```

**Secrets الإلزامية:**

| المتغير                   | الوصف                       | ملاحظة          |
| ------------------------- | --------------------------- | --------------- |
| `WA_ACCESS_TOKEN`         | Meta Access Token           | مطلوب           |
| `META_TOKEN`              | نفس WA_ACCESS_TOKEN         | alias           |
| `WA_APP_SECRET`           | Meta App Secret             | للـ HMAC-SHA256 |
| `META_APP_SECRET`         | نفس WA_APP_SECRET           | alias           |
| `WA_BUSINESS_ID`          | Business Manager ID         | مطلوب           |
| `WA_WEBHOOK_VERIFY_TOKEN` | رمز التحقق من الـ Webhook   | مطلوب           |
| `WHATSAPP_VERIFY_TOKEN`   | نفس WA_WEBHOOK_VERIFY_TOKEN | alias           |
| `ANTHROPIC_API_KEY`       | مفتاح Claude API            | للشات بوت       |
| `CHATBOT_ENABLED`         | `true`/`false`              | تفعيل الشات بوت |

**Secrets الاختيارية:**

| المتغير             | الوصف                    |
| ------------------- | ------------------------ |
| `OPENAI_API_KEY`    | لـ GPT models            |
| `GEMINI_API_KEY`    | لـ Vision/Image analysis |
| `CLOUDINARY_URL`    | تخزين الوسائط            |
| `SEAFILE_API_TOKEN` | تخزين Seafile            |
| `SEAFILE_URL`       | رابط Seafile             |
| `SEAFILE_REPO_ID`   | معرّف المستودع           |

### الخطوة 4 — نشر Edge Functions

```bash
# الطريقة السريعة — نشر الكل دفعة واحدة
./deploy-production.sh uwkdtbodoglbptiediea
```

أو نشر يدوي بالترتيب الصحيح:

```bash
# أولاً: Webhook المدخل
supabase functions deploy whatsapp_webhook --no-verify-jwt
supabase functions deploy wa_webhook_inbound --no-verify-jwt

# ثانياً: AI والشات بوت
supabase functions deploy chatbot_engine --no-verify-jwt
supabase functions deploy ai_auto_reply --no-verify-jwt
supabase functions deploy ai_vision --no-verify-jwt
supabase functions deploy ai_image_analyze --no-verify-jwt

# ثالثاً: إرسال الرسائل
supabase functions deploy send_message --no-verify-jwt
supabase functions deploy broadcast_send --no-verify-jwt
supabase functions deploy worker_dispatch --no-verify-jwt

# رابعاً: المزامنة والوسائط
supabase functions deploy templates_sync --no-verify-jwt
supabase functions deploy meta_sync_all --no-verify-jwt
supabase functions deploy media_signed_url --no-verify-jwt
supabase functions deploy media_delete --no-verify-jwt
supabase functions deploy media_sync_wa --no-verify-jwt
supabase functions deploy cloudinary_ops --no-verify-jwt
supabase functions deploy seafile_upload --no-verify-jwt

# خامساً: الإدارة
supabase functions deploy api_keys_manage --no-verify-jwt
supabase functions deploy webhooks_manage --no-verify-jwt
supabase functions deploy diagnose_number --no-verify-jwt
supabase functions deploy provision_tenant --no-verify-jwt
```

### الخطوة 5 — إعداد Meta Webhook

1. اذهب إلى: **Meta for Developers → WhatsApp → Configuration**
2. في **Callback URL**:
   ```
   https://uwkdtbodoglbptiediea.supabase.co/functions/v1/whatsapp_webhook
   ```
3. في **Verify Token**: نفس قيمة `WA_WEBHOOK_VERIFY_TOKEN`
4. فعّل الـ **Webhook Fields**:
   - ✅ `messages`
   - ✅ `message_deliveries`
   - ✅ `message_reads`

**اختبار التحقق:**

```bash
curl "https://uwkdtbodoglbptiediea.supabase.co/functions/v1/whatsapp_webhook\
?hub.mode=subscribe\
&hub.verify_token=YOUR_VERIFY_TOKEN\
&hub.challenge=test_123"
# يجب أن يرد: test_123
```

### الخطوة 6 — بناء ونشر الـ Frontend

```bash
# إنشاء .env.production
cp .env.production.example .env
# عدّل VITE_SUPABASE_ANON_KEY و VITE_APP_URL

# بناء للإنتاج
npm ci
npm run build

# نشر على Vercel (الموصى به)
npx vercel --prod

# أو Netlify
npx netlify deploy --prod --dir dist

# أو Cloudflare Pages
npx wrangler pages deploy dist
```

---

## ✅ قائمة التحقق قبل الإطلاق

### 🔒 الأمان

- [ ] `META_APP_SECRET` محدد (HMAC-SHA256 مفعّل)
- [ ] `WA_WEBHOOK_VERIFY_TOKEN` قوي وعشوائي (20+ حرف)
- [ ] ملف `.env` في `.gitignore`
- [ ] RLS مفعّل على جميع الجداول في Supabase
- [ ] لا توجد API Keys في الكود مباشرة

### 🗄️ قاعدة البيانات

- [ ] جميع الـ 14 migration شُغِّلت بالترتيب الصحيح
- [ ] لا توجد أخطاء في SQL Editor بعد التشغيل
- [ ] جداول `media_folders` و `chatbot_rules` موجودة

### ⚡ Edge Functions

- [ ] جميع الـ 20 دالة منشورة بنجاح
- [ ] جميع الـ Secrets مضافة في Supabase Dashboard
- [ ] Webhook Verification test نجح

### 🌐 الاتصال بـ Meta

- [ ] Callback URL مسجّل في Meta Dashboard
- [ ] Webhook Fields مفعّلة (messages, deliveries, reads)
- [ ] اختبار استقبال رسالة حقيقية نجح

### 🎨 Frontend

- [ ] `VITE_SUPABASE_URL` يشير للمشروع الصحيح
- [ ] `VITE_SUPABASE_ANON_KEY` صحيح (وليس service_role_key!)
- [ ] `VITE_APP_URL` يشير لدومين الإنتاج
- [ ] Build ناجح بدون TypeScript errors

---

## 🔍 مراقبة الإنتاج

### Supabase Logs

```
Supabase Dashboard → Edge Functions → [اسم الدالة] → Logs
```

### فحص الصحة يدوياً

```bash
# فحص Webhook
curl https://uwkdtbodoglbptiediea.supabase.co/functions/v1/whatsapp_webhook

# فحص send_message
curl -X POST https://uwkdtbodoglbptiediea.supabase.co/functions/v1/send_message \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### Meta Webhook Stats

- Meta Business Manager → WhatsApp → Configuration → نسبة النجاح يجب > 99%

---

## 🐛 مشاكل شائعة وحلولها

### Webhook لا يستقبل رسائل

1. تحقق من `WA_WEBHOOK_VERIFY_TOKEN` يطابق ما في Meta Dashboard
2. تحقق أن الدالة منشورة: `supabase functions list`
3. راجع logs: Supabase → Edge Functions → whatsapp_webhook → Logs

### رسائل لا تُرسَل

1. تحقق من `WA_ACCESS_TOKEN` لم ينتهِ صلاحيته
2. تحقق من أن رقم الهاتف في حالة `CONNECTED`
3. راجع logs: `send_message` function

### الشات بوت لا يرد

1. تحقق من `CHATBOT_ENABLED=true` في Secrets
2. تحقق من `ANTHROPIC_API_KEY` صحيح
3. تحقق من وجود قواعد في جدول `chatbot_rules`

### خطأ في Migration

```sql
-- للتحقق من حالة الجداول
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

---

## 📱 بناء تطبيق Android

```bash
# بناء الـ web assets أولاً
npm run build

# مزامنة مع Capacitor
npx cap sync android

# فتح في Android Studio
npx cap open android

# أو بناء APK مباشرة
cd android && ./gradlew assembleRelease
```

---

## 📊 معلومات المشروع

- **Project ID**: `uwkdtbodoglbptiediea`
- **Webhook URL**: `https://uwkdtbodoglbptiediea.supabase.co/functions/v1/whatsapp_webhook`
- **Primary WA Number**: `+201004006620` (مصر)
- **Primary WABA ID**: `3773448776290331`
- **Meta App ID**: `889346333913449`
- **Meta Business ID**: `314437023701205`
- **Meta API Version**: `v24.0`

---

_آخر تحديث: 2026-03-27 | SouqChat Production Guide_
