
-- =============================================
-- WhatsApp Business Platform — Complete Schema
-- =============================================

-- 1. ENUMS
DO $`nBEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wa_number_type') THEN
    CREATE TYPE public.wa_number_type AS ENUM ('connected','digital','sandbox');
  END IF;
END`n$;
DO $`nBEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'msg_direction') THEN
    CREATE TYPE public.msg_direction AS ENUM ('inbound','outbound');
  END IF;
END`n$;
DO $`nBEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'msg_status') THEN
    CREATE TYPE public.msg_status AS ENUM ('queued','sent','delivered','read','failed');
  END IF;
END`n$;
DO $`nBEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conv_status') THEN
    CREATE TYPE public.conv_status AS ENUM ('open','pending','closed');
  END IF;
END`n$;
DO $`nBEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_kind') THEN
    CREATE TYPE public.media_kind AS ENUM ('image','video','audio','document','sticker','other');
  END IF;
END`n$;
DO $`nBEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tmpl_category') THEN
    CREATE TYPE public.tmpl_category AS ENUM ('UTILITY','MARKETING','AUTH');
  END IF;
END`n$;
DO $`nBEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tmpl_status') THEN
    CREATE TYPE public.tmpl_status AS ENUM ('APPROVED','PENDING','REJECTED','PAUSED');
  END IF;
END`n$;
DO $`nBEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_type') THEN
    CREATE TYPE public.job_type AS ENUM ('WEBHOOK_DELIVERY','TEMPLATE_SYNC','MEDIA_PROCESS','WORKFLOW_RUN','SEND_MESSAGE');
  END IF;
END`n$;

-- =============================================
-- 2. TABLES
-- =============================================

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.member_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

CREATE TABLE public.wa_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label text NOT NULL,
  waba_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wa_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wa_account_id uuid NOT NULL REFERENCES public.wa_accounts(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  phone_number_id text NOT NULL,
  type public.wa_number_type NOT NULL DEFAULT 'connected',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz
);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  display_name text,
  wa_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone_e164)
);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wa_number_id uuid NOT NULL REFERENCES public.wa_numbers(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status public.conv_status NOT NULL DEFAULT 'open',
  assigned_to uuid,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  direction public.msg_direction NOT NULL,
  status public.msg_status NOT NULL DEFAULT 'queued',
  text text,
  provider_message_id text,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.conversation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.media_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id),
  kind public.media_kind NOT NULL DEFAULT 'other',
  mime text,
  size_bytes bigint,
  storage_bucket text NOT NULL DEFAULT 'wa-media',
  storage_key text UNIQUE,
  sha256 text,
  received_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wa_account_id uuid NOT NULL REFERENCES public.wa_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  category public.tmpl_category NOT NULL DEFAULT 'UTILITY',
  language text NOT NULL DEFAULT 'ar',
  status public.tmpl_status NOT NULL DEFAULT 'PENDING',
  body text,
  variables jsonb NOT NULL DEFAULT '[]',
  meta jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, wa_account_id, name, language)
);

CREATE TABLE public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret_hash text,
  events jsonb NOT NULL DEFAULT '[]',
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  webhook_endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status_code int,
  success boolean NOT NULL DEFAULT false,
  attempts int NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]',
  last_used_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  rules jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  trigger_event text,
  status text NOT NULL DEFAULT 'pending',
  log jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  meta jsonb NOT NULL DEFAULT '{}',
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.job_queue (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_type public.job_type NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  run_after timestamptz NOT NULL DEFAULT now(),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 10,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- 3. INDEXES
-- =============================================

CREATE INDEX idx_messages_conv_created ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_provider_id ON public.messages(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX idx_conversations_tenant_last ON public.conversations(tenant_id, last_message_at DESC);
CREATE INDEX idx_contacts_tenant_phone ON public.contacts(tenant_id, phone_e164);
CREATE INDEX idx_media_tenant_received ON public.media_files(tenant_id, received_at DESC);
CREATE INDEX idx_job_queue_pending ON public.job_queue(run_after) WHERE locked_at IS NULL;
CREATE INDEX idx_audit_tenant_created ON public.audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_wa_numbers_phone_id ON public.wa_numbers(phone_number_id);
CREATE INDEX idx_webhook_deliveries_retry ON public.webhook_deliveries(next_retry_at) WHERE success = false AND next_retry_at IS NOT NULL;

-- =============================================
-- 4. SECURITY DEFINER FUNCTIONS (RBAC)
-- =============================================

CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = _tenant_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.has_tenant_role(_tenant_id uuid, _min_role public.member_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = _tenant_id
      AND user_id = auth.uid()
      AND CASE _min_role
        WHEN 'viewer' THEN role IN ('viewer','operator','admin')
        WHEN 'operator' THEN role IN ('operator','admin')
        WHEN 'admin' THEN role = 'admin'
      END
  )
$$;

-- =============================================
-- 5. RLS ENABLE
-- =============================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 6. RLS POLICIES
-- =============================================

-- profiles
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- tenants
CREATE POLICY "tenants_select_member" ON public.tenants FOR SELECT TO authenticated USING (public.is_tenant_member(id));
CREATE POLICY "tenants_update_admin" ON public.tenants FOR UPDATE TO authenticated USING (public.has_tenant_role(id, 'admin'));

-- tenant_members
CREATE POLICY "tm_select_member" ON public.tenant_members FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tm_insert_admin" ON public.tenant_members FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, 'admin'));
CREATE POLICY "tm_update_admin" ON public.tenant_members FOR UPDATE TO authenticated USING (public.has_tenant_role(tenant_id, 'admin'));
CREATE POLICY "tm_delete_admin" ON public.tenant_members FOR DELETE TO authenticated USING (public.has_tenant_role(tenant_id, 'admin'));

-- wa_accounts
CREATE POLICY "wa_acc_select" ON public.wa_accounts FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "wa_acc_insert" ON public.wa_accounts FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, 'admin'));
CREATE POLICY "wa_acc_update" ON public.wa_accounts FOR UPDATE TO authenticated USING (public.has_tenant_role(tenant_id, 'admin'));
CREATE POLICY "wa_acc_delete" ON public.wa_accounts FOR DELETE TO authenticated USING (public.has_tenant_role(tenant_id, 'admin'));

-- wa_numbers
CREATE POLICY "wa_num_select" ON public.wa_numbers FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "wa_num_insert" ON public.wa_numbers FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, 'admin'));
CREATE POLICY "wa_num_update" ON public.wa_numbers FOR UPDATE TO authenticated USING (public.has_tenant_role(tenant_id, 'admin'));
CREATE POLICY "wa_num_delete" ON public.wa_numbers FOR DELETE TO authenticated USING (public.has_tenant_role(tenant_id, 'admin'));

-- contacts
CREATE POLICY "contacts_select" ON public.contacts FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "contacts_insert" ON public.contacts FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, 'operator'));
CREATE POLICY "contacts_update" ON public.contacts FOR UPDATE TO authenticated USING (public.has_tenant_role(tenant_id, 'operator'));

-- conversations
CREATE POLICY "conv_select" ON public.conversations FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "conv_insert" ON public.conversations FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, 'operator'));
CREATE POLICY "conv_update" ON public.conversations FOR UPDATE TO authenticated USING (public.has_tenant_role(tenant_id, 'operator'));

-- messages
CREATE POLICY "msg_select" ON public.messages FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "msg_insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, 'operator'));

-- conversation_notes
CREATE POLICY "notes_select" ON public.conversation_notes FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "notes_insert" ON public.conversation_notes FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, 'operator'));

-- media_files
CREATE POLICY "media_select" ON public.media_files FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id) AND deleted_at IS NULL);
CREATE POLICY "media_update_op" ON public.media_files FOR UPDATE TO authenticated USING (public.has_tenant_role(tenant_id, 'operator'));

-- templates
CREATE POLICY "tmpl_select" ON public.templates FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tmpl_insert" ON public.templates FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, 'operator'));
CREATE POLICY "tmpl_update" ON public.templates FOR UPDATE TO authenticated USING (public.has_tenant_role(tenant_id, 'operator'));

-- webhook_endpoints (admin only)
CREATE POLICY "wh_ep_select" ON public.webhook_endpoints FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "wh_ep_insert" ON public.webhook_endpoints FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, 'admin'));
CREATE POLICY "wh_ep_update" ON public.webhook_endpoints FOR UPDATE TO authenticated USING (public.has_tenant_role(tenant_id, 'admin'));
CREATE POLICY "wh_ep_delete" ON public.webhook_endpoints FOR DELETE TO authenticated USING (public.has_tenant_role(tenant_id, 'admin'));

-- webhook_deliveries
CREATE POLICY "wh_del_select" ON public.webhook_deliveries FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

-- api_keys (admin only)
CREATE POLICY "ak_select" ON public.api_keys FOR SELECT TO authenticated USING (public.has_tenant_role(tenant_id, 'admin'));
CREATE POLICY "ak_insert" ON public.api_keys FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, 'admin'));
CREATE POLICY "ak_update" ON public.api_keys FOR UPDATE TO authenticated USING (public.has_tenant_role(tenant_id, 'admin'));
CREATE POLICY "ak_delete" ON public.api_keys FOR DELETE TO authenticated USING (public.has_tenant_role(tenant_id, 'admin'));

-- workflows (admin only for mutations)
CREATE POLICY "wf_select" ON public.workflows FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "wf_insert" ON public.workflows FOR INSERT TO authenticated WITH CHECK (public.has_tenant_role(tenant_id, 'admin'));
CREATE POLICY "wf_update" ON public.workflows FOR UPDATE TO authenticated USING (public.has_tenant_role(tenant_id, 'admin'));
CREATE POLICY "wf_delete" ON public.workflows FOR DELETE TO authenticated USING (public.has_tenant_role(tenant_id, 'admin'));

-- workflow_runs
CREATE POLICY "wfr_select" ON public.workflow_runs FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

-- audit_logs (admin only)
CREATE POLICY "audit_select" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_tenant_role(tenant_id, 'admin'));

-- job_queue: no client policies (service role only)

-- =============================================
-- 7. TRIGGER FUNCTIONS
-- =============================================

-- updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- on message insert: update conversation + enqueue workflow
CREATE OR REPLACE FUNCTION public.on_message_inserted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  IF NEW.direction = 'inbound' THEN
    INSERT INTO public.job_queue (tenant_id, job_type, payload)
    VALUES (NEW.tenant_id, 'WORKFLOW_RUN',
      jsonb_build_object('tenant_id', NEW.tenant_id, 'message_id', NEW.id, 'conversation_id', NEW.conversation_id));
  END IF;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, entity, entity_id)
  VALUES (NEW.tenant_id, auth.uid(), 'MESSAGE_CREATED', 'messages', NEW.id);
  RETURN NEW;
END;
$$;

-- generic audit trigger
CREATE OR REPLACE FUNCTION public.audit_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tid uuid; _eid uuid; _action text;
BEGIN
  _tid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  _eid := COALESCE(NEW.id, OLD.id);
  _action := TG_ARGV[0] || '_' || TG_OP;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, entity, entity_id, meta)
  VALUES (_tid, auth.uid(), _action, TG_TABLE_NAME, _eid, jsonb_build_object('op', TG_OP));
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- media soft delete audit
CREATE OR REPLACE FUNCTION public.on_media_soft_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO public.audit_logs (tenant_id, user_id, action, entity, entity_id)
    VALUES (NEW.tenant_id, auth.uid(), 'MEDIA_SOFT_DELETE', 'media_files', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================
-- 8. TRIGGERS
-- =============================================

CREATE TRIGGER set_contacts_updated_at BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_templates_updated_at BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_message_inserted AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.on_message_inserted();

CREATE TRIGGER trg_media_soft_delete AFTER UPDATE ON public.media_files
  FOR EACH ROW EXECUTE FUNCTION public.on_media_soft_delete();

CREATE TRIGGER audit_api_keys AFTER INSERT OR UPDATE OR DELETE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.audit_change('APIKEY');

CREATE TRIGGER audit_webhook_endpoints AFTER INSERT OR UPDATE OR DELETE ON public.webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.audit_change('WEBHOOK');

CREATE TRIGGER audit_templates AFTER INSERT OR UPDATE OR DELETE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.audit_change('TEMPLATE');

CREATE TRIGGER audit_workflows AFTER INSERT OR UPDATE OR DELETE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.audit_change('WORKFLOW');

-- =============================================
-- 9. STORAGE BUCKET (private — no direct client access)
-- =============================================

INSERT INTO storage.buckets (id, name, public) VALUES ('wa-media', 'wa-media', false);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'member_role'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.member_role AS ENUM ('admin','operator','viewer');
  END IF;
END
$$;