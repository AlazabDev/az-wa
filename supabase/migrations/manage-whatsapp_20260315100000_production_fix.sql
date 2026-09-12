-- ══════════════════════════════════════════════════════════════
-- SouqChat — Production Fix Migration
-- تاريخ: 2026-03-15
-- يُصلح: جداول مفقودة، أعمدة مفقودة، indexes حرجة
-- ══════════════════════════════════════════════════════════════

-- ┌─────────────────────────────────────────────────────────────┐
-- │ 1. أعمدة مفقودة في جدول messages                          │
-- │    يستخدمها wa_webhook_inbound لتتبع حالة التوصيل         │
-- └─────────────────────────────────────────────────────────────┘
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sent_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_by_user_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_received      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chat_id          TEXT;

-- ┌─────────────────────────────────────────────────────────────┐
-- │ 2. جدول media_folders                                      │
-- │    مُستخدَم في Gallery.tsx + FolderSidebar.tsx             │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS public.media_folders (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.media_folders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_media_folders_tenant
  ON public.media_folders(tenant_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='media_folders' AND policyname='folders_select') THEN
    CREATE POLICY "folders_select" ON public.media_folders
      FOR SELECT USING (is_tenant_member(tenant_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='media_folders' AND policyname='folders_insert') THEN
    CREATE POLICY "folders_insert" ON public.media_folders
      FOR INSERT WITH CHECK (has_tenant_role(tenant_id,'operator'::member_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='media_folders' AND policyname='folders_update') THEN
    CREATE POLICY "folders_update" ON public.media_folders
      FOR UPDATE USING (has_tenant_role(tenant_id,'operator'::member_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='media_folders' AND policyname='folders_delete') THEN
    CREATE POLICY "folders_delete" ON public.media_folders
      FOR DELETE USING (has_tenant_role(tenant_id,'admin'::member_role));
  END IF;
END $$;

-- ┌─────────────────────────────────────────────────────────────┐
-- │ 3. عمود folder_id في media_files                           │
-- └─────────────────────────────────────────────────────────────┘
ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS folder_id UUID
    REFERENCES public.media_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_media_files_folder_id
  ON public.media_files(folder_id)
  WHERE folder_id IS NOT NULL;

-- ┌─────────────────────────────────────────────────────────────┐
-- │ 4. جدول ai_extractions                                     │
-- │    موجود في types.ts لكن غائب من migrations               │
-- └─────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS public.ai_extractions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  message_id       UUID        REFERENCES public.messages(id)    ON DELETE SET NULL,
  media_file_id    UUID        REFERENCES public.media_files(id) ON DELETE SET NULL,
  status           TEXT        NOT NULL DEFAULT 'pending',
  raw_text         TEXT,
  summary          TEXT,
  extracted_fields JSONB       NOT NULL DEFAULT '{}',
  entities         JSONB       NOT NULL DEFAULT '{}',
  confidence       NUMERIC(5,4),
  model_used       TEXT,
  error_message    TEXT,
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_extractions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ai_ext_tenant
  ON public.ai_extractions(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_ext_msg
  ON public.ai_extractions(message_id)
  WHERE message_id IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ai_extractions' AND policyname='ai_select') THEN
    CREATE POLICY "ai_select" ON public.ai_extractions
      FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ai_extractions' AND policyname='ai_insert') THEN
    CREATE POLICY "ai_insert" ON public.ai_extractions
      FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id,'operator'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ai_extractions' AND policyname='ai_update') THEN
    CREATE POLICY "ai_update" ON public.ai_extractions
      FOR UPDATE TO authenticated USING (public.has_tenant_role(tenant_id,'operator'));
  END IF;
END $$;

-- ┌─────────────────────────────────────────────────────────────┐
-- │ 5. Unique indexes مطلوبة لعمليات upsert في Edge Functions  │
-- └─────────────────────────────────────────────────────────────┘

-- wa_accounts: waba واحد لكل tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_accounts_tenant_waba
  ON public.wa_accounts (tenant_id, waba_id);

-- wa_numbers: phone_number_id واحد لكل tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_numbers_tenant_phone_id
  ON public.wa_numbers (tenant_id, phone_number_id);

-- templates: اسم + لغة فريد لكل حساب داخل tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_templates_tenant_account_name_lang
  ON public.templates (tenant_id, wa_account_id, name, language);

-- ┌─────────────────────────────────────────────────────────────┐
-- │ 6. Indexes إضافية للأداء                                   │
-- └─────────────────────────────────────────────────────────────┘

-- تسريع تتبع حالة الرسائل في webhook
CREATE INDEX IF NOT EXISTS idx_messages_provider_status
  ON public.messages (provider_message_id, status)
  WHERE provider_message_id IS NOT NULL;

-- تسريع بحث جهات الاتصال
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_phone
  ON public.contacts (tenant_id, phone_e164);

-- تسريع استعلامات الصندوق الوارد
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_status
  ON public.conversations (tenant_id, status, last_message_at DESC NULLS LAST);

-- تسريع webhook delivery retries
CREATE INDEX IF NOT EXISTS idx_wh_del_retry
  ON public.webhook_deliveries (next_retry_at)
  WHERE success = false AND next_retry_at IS NOT NULL;

-- ┌─────────────────────────────────────────────────────────────┐
-- │ 7. Storage bucket (idempotent)                             │
-- └─────────────────────────────────────────────────────────────┘
INSERT INTO storage.buckets (id, name, public)
VALUES ('wa-media', 'wa-media', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
    AND policyname='wa_media_select_tenant_members'
  ) THEN
    CREATE POLICY "wa_media_select_tenant_members"
    ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'wa-media' AND
      CASE WHEN (storage.foldername(name))[1] ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN public.is_tenant_member(((storage.foldername(name))[1])::uuid)
      ELSE false END
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
    AND policyname='wa_media_insert_tenant_operators'
  ) THEN
    CREATE POLICY "wa_media_insert_tenant_operators"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'wa-media' AND
      CASE WHEN (storage.foldername(name))[1] ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN public.has_tenant_role(
        ((storage.foldername(name))[1])::uuid,
        'operator'::public.member_role
      )
      ELSE false END
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
    AND policyname='wa_media_delete_tenant_operators'
  ) THEN
    CREATE POLICY "wa_media_delete_tenant_operators"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id = 'wa-media' AND
      CASE WHEN (storage.foldername(name))[1] ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN public.has_tenant_role(
        ((storage.foldername(name))[1])::uuid,
        'operator'::public.member_role
      )
      ELSE false END
    );
  END IF;
END $$;
