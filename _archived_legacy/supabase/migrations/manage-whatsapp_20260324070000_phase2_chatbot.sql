-- Phase 2 — Chatbot Engine
-- جداول وأعمدة المرحلة الثانية فقط

-- 1) chatbot_rules
CREATE TABLE IF NOT EXISTS public.chatbot_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wa_number_id uuid REFERENCES public.wa_numbers(id) ON DELETE CASCADE,
  trigger_type text NOT NULL CHECK (trigger_type IN ('keyword','regex','any','first_message')),
  trigger_value text,
  response_type text NOT NULL CHECK (response_type IN ('text','template','human_takeover','ai_reply')),
  response_text text,
  template_name text,
  template_language text DEFAULT 'ar',
  template_params jsonb DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_rules_tenant_active_priority
  ON public.chatbot_rules (tenant_id, is_active, priority DESC);

CREATE INDEX IF NOT EXISTS idx_chatbot_rules_wa_number
  ON public.chatbot_rules (wa_number_id);

ALTER TABLE public.chatbot_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chatbot_rules'
      AND policyname = 'chatbot_rules_tenant_select'
  ) THEN
    CREATE POLICY chatbot_rules_tenant_select
      ON public.chatbot_rules
      FOR SELECT
      USING (public.is_tenant_member(tenant_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chatbot_rules'
      AND policyname = 'chatbot_rules_tenant_insert'
  ) THEN
    CREATE POLICY chatbot_rules_tenant_insert
      ON public.chatbot_rules
      FOR INSERT
      WITH CHECK (public.has_tenant_role(tenant_id, 'operator'::public.member_role));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chatbot_rules'
      AND policyname = 'chatbot_rules_tenant_update'
  ) THEN
    CREATE POLICY chatbot_rules_tenant_update
      ON public.chatbot_rules
      FOR UPDATE
      USING (public.has_tenant_role(tenant_id, 'operator'::public.member_role));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chatbot_rules'
      AND policyname = 'chatbot_rules_tenant_delete'
  ) THEN
    CREATE POLICY chatbot_rules_tenant_delete
      ON public.chatbot_rules
      FOR DELETE
      USING (public.has_tenant_role(tenant_id, 'admin'::public.member_role));
  END IF;
END $$;

-- 2) messages columns required by phase 2
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS timestamp timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_ai_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS media_wa_id text,
  ADD COLUMN IF NOT EXISTS media_mime text,
  ADD COLUMN IF NOT EXISTS media_filename text,
  ADD COLUMN IF NOT EXISTS interactive_payload jsonb,
  ADD COLUMN IF NOT EXISTS error_payload jsonb,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_timestamp
  ON public.messages (conversation_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_messages_provider_message_id
  ON public.messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- 3) conversations columns required by phase 2
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS chatbot_state text
    CHECK (chatbot_state IN ('active', 'human_takeover', 'paused'))
    DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_conversations_chatbot_state
  ON public.conversations (tenant_id, chatbot_state);

-- 4) updated_at trigger for chatbot_rules
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chatbot_rules_set_updated_at ON public.chatbot_rules;
CREATE TRIGGER trg_chatbot_rules_set_updated_at
BEFORE UPDATE ON public.chatbot_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
