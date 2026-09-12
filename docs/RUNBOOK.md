# Alazab Meta Platform — Full Inventory & Integration Audit (Graph API v26.0)

هذه الحزمة مخصصة لجرد واختبار منصة Meta بالكامل، وليست لتطبيق WhatsApp واحد.

## محتوى الأسرار

- `.env` — المصدر الفعلي المنظم لجميع التطبيقات والتوكنات الموجودة في الحزمة المرفقة. يحتوي أسرارًا حقيقية.
- `.env.raw` — نسخة محفوظة حرفيًا من ملف الأسرار الخام المرفق قبل تنظيمه.
- `meta_whatsapp.env` — ملف توافق WhatsApp بالقيم الفعلية الموجودة/المستخرجة، بدون Placeholders.
- `inventory/secrets/*.env` — ينشئها السكربت لكل App مع App Secret وApp Access Token وVerify Token والتوكنات التي يثبت `debug_token` أنها مرتبطة بالتطبيق.
- `inventory/secrets/page_access_tokens.env` — Page Access Tokens المشتقة من Meta عند توفر الصلاحية.

كل ملفات الأسرار تعمل بصلاحية `600`، ومجلد `inventory` يصبح خاصًا بالمستخدم فقط بعد الجرد.

## التطبيقات المعرفة في الحزمة

الملف `meta_apps_manifest.json` يحتوي 7 Apps مهيأة من الملف الأصلي، بينما `.env` يحتوي القيم السرية الفعلية لها. لا توجد قيمة App Secret أو Access Token فارغة في الملف الفعال.

## التشغيل

```bash
chmod 700 meta_all_in_one.sh verify_bundle.sh
chmod 600 .env .env.raw meta_whatsapp.env

./verify_bundle.sh
./meta_all_in_one.sh all
```

اختبار التوكنات فقط:

```bash
./meta_all_in_one.sh tokens
```

جرد التطبيقات فقط:

```bash
./meta_all_in_one.sh apps
```

## ما يختبره `all`

1. كل Token: `debug_token`, App binding, validity, type, user_id, expiry, data-access expiry, scopes, granular scopes, permissions.
2. كل App: identity, namespace/link إن أتاحتها Meta، app roles، webhook subscriptions، وربط التوكنات بالتطبيق الصحيح.
3. Business: owned/client apps, pages, ad accounts, product catalogs, Instagram accounts, pixels, WABAs, system users, business users, asset groups.
4. WhatsApp: WABA info, phone numbers, templates, subscribed apps, Flows, assigned users.
5. Facebook/Messenger: Page info, app subscriptions, Messenger Profile, Messenger conversations.
6. Instagram: Business profile, media, stories, Instagram messaging conversations عند توفر الصلاحية.
7. Threads: profile, permissions, Threads posts, mentions، مع فحص Scopes الحديثة الموجودة في `meta_v26_changes.json`.
8. Marketing: ad accounts, campaigns, ad sets, ads, v26 ad creatives including `wamo_whatsapp_identity_spec`, pixels, custom audiences, custom conversions, account insights 30 days.
9. Catalogs: catalog info and products.
10. كل Endpoint غير مصرح به أو غير متاح يسجل استجابة الخطأ في ملف الجرد ولا يوقف باقي الفحص.

## مخرجات الجرد

```text
inventory/
├── apps/           # ملف JSON مستقل لكل App
├── tokens/         # token_inventory.json
├── business/       # Business assets/edges
├── wabas/          # ملف شامل + تفاصيل لكل WABA
├── pages/          # Page + Messenger/Instagram messaging
├── instagram/      # Profile + media + stories
├── threads/        # Threads probes
├── marketing/      # Ads/Adsets/Campaigns/Creatives/Pixels/etc.
├── catalogs/       # Catalogs/products
├── secrets/        # App-specific actual secret env files (chmod 600)
├── meta_inventory_all.json
└── summary.json
```

بعد نجاح `all`، ينسخ السكربت الجرد الإجمالي أيضًا إلى:

```text
meta_alazab_all.json
```

والملف القديم المولد بالسكربت السابق v24 محفوظ باسم:

```text
meta_alazab_all_legacy_v24.json
```

## Graph API v26.0

`meta_v26_changes.json` يسجل تغطية v26 الحالية التي يجب أخذها في الاختبار، ومنها تغييرات Marketing API وCommerce وNew Pages Experience وWhatsApp Status Ads، بالإضافة إلى قدرات Threads الحالية.

النسخة مثبتة صراحة:

```text
https://graph.facebook.com/v26.0
```

Threads تستخدم المضيف الصحيح المستقل:

```text
https://graph.threads.net/v1.0
```

## سياسة الاختبار

السكربت Read-Only. لا يرسل WhatsApp messages، لا ينشر Threads/Instagram/Page posts، ولا ينشئ/يعدل إعلانات. الغرض الأول هو إثبات الوصول والصلاحيات والجرد الكامل قبل تشغيل اختبارات الكتابة المقصودة.
