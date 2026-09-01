-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('super_admin','admin','supervisor','agent','marketing','developer','viewer');
CREATE TYPE public.entity_status AS ENUM ('active','disabled','pending','missing','archived');
CREATE TYPE public.health_status AS ENUM ('healthy','warning','critical','offline','unknown');
CREATE TYPE public.message_direction AS ENUM ('inbound','outbound');
CREATE TYPE public.message_state AS ENUM ('queued','submitted','sent','delivered','read','failed');
CREATE TYPE public.credential_type AS ENUM ('business','waba','phone','system_user');
CREATE TYPE public.campaign_status AS ENUM ('draft','scheduled','running','paused','completed','failed');
CREATE TYPE public.job_status AS ENUM ('pending','running','completed','failed','dead');
CREATE TYPE public.access_level AS ENUM ('none','read','read_send','manage');

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ IDENTITY ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('super_admin','admin'));
$$;

CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count int;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  SELECT count(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams read" ON public.teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "teams manage" ON public.teams FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ META HIERARCHY ============
CREATE TABLE public.business_portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_business_id text NOT NULL UNIQUE,
  name text NOT NULL,
  meta_app_id text,
  namespace text,
  status public.entity_status NOT NULL DEFAULT 'active',
  health public.health_status NOT NULL DEFAULT 'unknown',
  last_synced_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wabas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_portfolio_id uuid NOT NULL REFERENCES public.business_portfolios(id) ON DELETE CASCADE,
  meta_waba_id text NOT NULL UNIQUE,
  name text,
  currency text,
  timezone text,
  status public.entity_status NOT NULL DEFAULT 'active',
  health public.health_status NOT NULL DEFAULT 'unknown',
  message_template_namespace text,
  last_synced_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wabas_portfolio ON public.wabas(business_portfolio_id);

CREATE TABLE public.whatsapp_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_portfolio_id uuid NOT NULL REFERENCES public.business_portfolios(id) ON DELETE CASCADE,
  waba_id uuid NOT NULL REFERENCES public.wabas(id) ON DELETE CASCADE,
  meta_phone_number_id text NOT NULL UNIQUE,
  display_phone_number text NOT NULL,
  verified_name text,
  internal_name text,
  department text,
  country text,
  purpose text,
  tags text[] NOT NULL DEFAULT '{}',
  quality_rating text,
  messaging_limit text,
  platform_status text,
  status public.entity_status NOT NULL DEFAULT 'active',
  enabled boolean NOT NULL DEFAULT true,
  webhook_status public.health_status NOT NULL DEFAULT 'unknown',
  api_health public.health_status NOT NULL DEFAULT 'unknown',
  health public.health_status NOT NULL DEFAULT 'unknown',
  last_incoming_at timestamptz,
  last_outgoing_at timestamptz,
  last_synced_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_numbers_waba ON public.whatsapp_numbers(waba_id);
CREATE INDEX idx_numbers_portfolio ON public.whatsapp_numbers(business_portfolio_id);

CREATE TABLE public.meta_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_portfolio_id uuid REFERENCES public.business_portfolios(id) ON DELETE CASCADE,
  waba_id uuid REFERENCES public.wabas(id) ON DELETE CASCADE,
  whatsapp_number_id uuid REFERENCES public.whatsapp_numbers(id) ON DELETE CASCADE,
  credential_type public.credential_type NOT NULL,
  label text,
  secret_reference text NOT NULL,
  expires_at timestamptz,
  status public.entity_status NOT NULL DEFAULT 'active',
  last_verified_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_credentials_scope ON public.meta_credentials(whatsapp_number_id, waba_id, business_portfolio_id);

-- ============ ACCESS ============
CREATE TABLE public.user_business_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  business_portfolio_id uuid NOT NULL REFERENCES public.business_portfolios(id) ON DELETE CASCADE,
  level public.access_level NOT NULL DEFAULT 'read',
  UNIQUE (user_id, business_portfolio_id)
);
CREATE TABLE public.user_waba_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  waba_id uuid NOT NULL REFERENCES public.wabas(id) ON DELETE CASCADE,
  level public.access_level NOT NULL DEFAULT 'read',
  UNIQUE (user_id, waba_id)
);
CREATE TABLE public.user_number_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  whatsapp_number_id uuid NOT NULL REFERENCES public.whatsapp_numbers(id) ON DELETE CASCADE,
  level public.access_level NOT NULL DEFAULT 'read',
  UNIQUE (user_id, whatsapp_number_id)
);

CREATE OR REPLACE FUNCTION public.can_read_number(_user_id uuid, _number_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_user_id)
    OR EXISTS (SELECT 1 FROM public.user_number_access a WHERE a.user_id = _user_id AND a.whatsapp_number_id = _number_id AND a.level <> 'none')
    OR EXISTS (
      SELECT 1 FROM public.whatsapp_numbers n
      JOIN public.user_waba_access w ON w.waba_id = n.waba_id AND w.user_id = _user_id AND w.level <> 'none'
      WHERE n.id = _number_id)
    OR EXISTS (
      SELECT 1 FROM public.whatsapp_numbers n
      JOIN public.user_business_access b ON b.business_portfolio_id = n.business_portfolio_id AND b.user_id = _user_id AND b.level <> 'none'
      WHERE n.id = _number_id);
$$;

-- ============ CRM / MESSAGING ============
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id text NOT NULL,
  phone text,
  name text,
  profile_name text,
  email text,
  company text,
  tags text[] NOT NULL DEFAULT '{}',
  source text,
  assigned_agent_id uuid,
  notes text,
  first_interaction_at timestamptz,
  last_interaction_at timestamptz,
  conversation_count int NOT NULL DEFAULT 0,
  message_count int NOT NULL DEFAULT 0,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wa_id)
);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  whatsapp_number_id uuid NOT NULL REFERENCES public.whatsapp_numbers(id) ON DELETE CASCADE,
  waba_id uuid NOT NULL REFERENCES public.wabas(id) ON DELETE CASCADE,
  business_portfolio_id uuid NOT NULL REFERENCES public.business_portfolios(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',
  assigned_user_id uuid,
  unread_count int NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, whatsapp_number_id)
);
CREATE INDEX idx_conv_number ON public.conversations(whatsapp_number_id, last_message_at DESC);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wamid text UNIQUE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  whatsapp_number_id uuid NOT NULL REFERENCES public.whatsapp_numbers(id) ON DELETE CASCADE,
  waba_id uuid NOT NULL REFERENCES public.wabas(id) ON DELETE CASCADE,
  direction public.message_direction NOT NULL,
  type text NOT NULL DEFAULT 'text',
  body text,
  caption text,
  reply_to_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  status public.message_state NOT NULL DEFAULT 'queued',
  error_code text,
  error_message text,
  sent_by_user_id uuid,
  template_id uuid,
  campaign_id uuid,
  idempotency_key text UNIQUE,
  timestamp timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conv ON public.messages(conversation_id, timestamp DESC);
CREATE INDEX idx_messages_number ON public.messages(whatsapp_number_id, timestamp DESC);

CREATE TABLE public.message_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  status public.message_state NOT NULL,
  error_code text,
  error_message text,
  raw_payload jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_msh_message ON public.message_status_history(message_id, occurred_at);

CREATE TABLE public.media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_media_id text,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  whatsapp_number_id uuid NOT NULL REFERENCES public.whatsapp_numbers(id) ON DELETE CASCADE,
  waba_id uuid REFERENCES public.wabas(id) ON DELETE CASCADE,
  filename text,
  mime_type text,
  size bigint,
  sha256 text,
  storage_provider text DEFAULT 'lovable_cloud_storage',
  storage_bucket text,
  storage_path text,
  download_status text NOT NULL DEFAULT 'pending',
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  downloaded_at timestamptz,
  UNIQUE (meta_media_id)
);

-- ============ TEMPLATES / CAMPAIGNS / AUTOMATION ============
CREATE TABLE public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waba_id uuid NOT NULL REFERENCES public.wabas(id) ON DELETE CASCADE,
  meta_template_id text,
  name text NOT NULL,
  category text,
  language text NOT NULL DEFAULT 'en',
  status text NOT NULL DEFAULT 'PENDING',
  quality text,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (waba_id, name, language)
);

CREATE TABLE public.template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sender_whatsapp_number_id uuid NOT NULL REFERENCES public.whatsapp_numbers(id) ON DELETE RESTRICT,
  template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamptz,
  status public.campaign_status NOT NULL DEFAULT 'draft',
  rate_limit_per_minute int NOT NULL DEFAULT 60,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  status public.message_state NOT NULL DEFAULT 'queued',
  error text,
  idempotency_key text UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id)
);

CREATE TABLE public.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  business_portfolio_id uuid REFERENCES public.business_portfolios(id) ON DELETE CASCADE,
  waba_id uuid REFERENCES public.wabas(id) ON DELETE CASCADE,
  whatsapp_number_id uuid REFERENCES public.whatsapp_numbers(id) ON DELETE CASCADE,
  trigger_type text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  whatsapp_number_id uuid REFERENCES public.whatsapp_numbers(id) ON DELETE SET NULL,
  trigger_payload jsonb,
  status text NOT NULL DEFAULT 'pending',
  error text,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- ============ WEBHOOKS / OPS ============
CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_portfolio_id uuid REFERENCES public.business_portfolios(id) ON DELETE SET NULL,
  waba_id uuid REFERENCES public.wabas(id) ON DELETE SET NULL,
  whatsapp_number_id uuid REFERENCES public.whatsapp_numbers(id) ON DELETE SET NULL,
  meta_waba_id text,
  meta_phone_number_id text,
  event_type text,
  message_id text,
  payload jsonb NOT NULL,
  signature_valid boolean NOT NULL DEFAULT false,
  deduplication_key text UNIQUE,
  received_at timestamptz NOT NULL DEFAULT now(),
  queued_at timestamptz,
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'received',
  attempts int NOT NULL DEFAULT 0,
  error text
);
CREATE INDEX idx_webhook_events_received ON public.webhook_events(received_at DESC);

CREATE TABLE public.unmapped_number_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_phone_number_id text NOT NULL,
  meta_waba_id text,
  display_phone_number text,
  payload jsonb NOT NULL,
  occurrences int NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved boolean NOT NULL DEFAULT false
);

CREATE TABLE public.api_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text,
  whatsapp_number_id uuid REFERENCES public.whatsapp_numbers(id) ON DELETE SET NULL,
  waba_id uuid REFERENCES public.wabas(id) ON DELETE SET NULL,
  endpoint text NOT NULL,
  method text NOT NULL,
  http_status int,
  duration_ms int,
  meta_error_code text,
  meta_error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_requests_created ON public.api_requests(created_at DESC);

CREATE TABLE public.api_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  code text,
  title text NOT NULL,
  waba_id uuid REFERENCES public.wabas(id) ON DELETE SET NULL,
  whatsapp_number_id uuid REFERENCES public.whatsapp_numbers(id) ON DELETE SET NULL,
  occurrences int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open',
  raw_error jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  description text,
  business_portfolio_id uuid REFERENCES public.business_portfolios(id) ON DELETE CASCADE,
  waba_id uuid REFERENCES public.wabas(id) ON DELETE CASCADE,
  whatsapp_number_id uuid REFERENCES public.whatsapp_numbers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE public.health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL,
  scope_id uuid,
  check_name text NOT NULL,
  status public.health_status NOT NULL DEFAULT 'unknown',
  detail text,
  latency_ms int,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_health_scope ON public.health_checks(scope_type, scope_id, checked_at DESC);

CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue text NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text UNIQUE,
  attempt int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  run_after timestamptz NOT NULL DEFAULT now(),
  status public.job_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error text
);
CREATE INDEX idx_jobs_queue ON public.jobs(queue, status, run_after);

CREATE TABLE public.dead_letter_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue text NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts int NOT NULL DEFAULT 0,
  error text,
  original_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  business_portfolio_id uuid,
  waba_id uuid,
  whatsapp_number_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON public.audit_logs(created_at DESC);

CREATE TABLE public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.outgoing_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret_reference text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ GRANTS + RLS (bulk) ============
DO $$
DECLARE t text;
  tables text[] := ARRAY[
    'business_portfolios','wabas','whatsapp_numbers','meta_credentials',
    'user_business_access','user_waba_access','user_number_access',
    'contacts','conversations','messages','message_status_history','media',
    'templates','template_versions','campaigns','campaign_recipients',
    'automation_rules','automation_runs','webhook_events','unmapped_number_events',
    'api_requests','api_errors','alerts','health_checks','jobs','dead_letter_jobs',
    'audit_logs','integrations','outgoing_webhooks','system_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "authenticated read %s" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY "admin manage %s" ON public.%I FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))', t, t);
  END LOOP;
END $$;

-- credentials: never readable by non-admins
DROP POLICY "authenticated read meta_credentials" ON public.meta_credentials;
CREATE POLICY "admin read meta_credentials" ON public.meta_credentials FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- updated_at triggers
DO $$
DECLARE t text;
  tables text[] := ARRAY['business_portfolios','wabas','whatsapp_numbers','meta_credentials','contacts','conversations','messages','templates','campaigns','automation_rules','profiles'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at_%s BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_events;

-- ============ INITIAL PRODUCTION IMPORT ============
INSERT INTO public.business_portfolios (meta_business_id, name, meta_app_id, namespace, status)
VALUES ('314437023701205', 'Al Azab Business Portfolio', '1061494059972503', 'azwhatsapp', 'active');

INSERT INTO public.wabas (business_portfolio_id, meta_waba_id, name, status)
SELECT bp.id, w.meta_waba_id, w.name, 'active'::public.entity_status
FROM public.business_portfolios bp,
(VALUES
  ('2154838801923462','Alazab Eg'),
  ('1527103499063250','Alazab Projects'),
  ('1303965001665007','Alazab'),
  ('2144651456337012','Mohamed Azab'),
  ('1458856398934130','Azab'),
  ('459851797218855','UberFix')
) AS w(meta_waba_id, name)
WHERE bp.meta_business_id = '314437023701205';

INSERT INTO public.whatsapp_numbers (business_portfolio_id, waba_id, meta_phone_number_id, display_phone_number, country)
SELECT w.business_portfolio_id, w.id, n.pn_id, n.display, n.country
FROM public.wabas w
JOIN (VALUES
  ('2154838801923462','1011864912017679','+201092750351','EG'),
  ('1527103499063250','1197837903405393','+201146395966','EG'),
  ('1303965001665007','1061490140383829','+201146397010','EG'),
  ('2144651456337012','1020054711186921','+12054605650','US'),
  ('1458856398934130','1032441389943808','+12064795608','US'),
  ('1458856398934130','952530191273396','+12083799564','US'),
  ('459851797218855','644995285354639','+15557285727','US'),
  ('459851797218855','527697617099639','+15557245001','US')
) AS n(waba, pn_id, display, country) ON n.waba = w.meta_waba_id;

-- Audited 2026-08-31: this Meta phone is disconnected and must never be an enabled sender.
UPDATE public.whatsapp_numbers
SET platform_status = 'DISCONNECTED', status = 'disabled', enabled = false
WHERE meta_phone_number_id = '1011864912017679';

INSERT INTO public.system_settings (key, value) VALUES
  ('meta_app', '{"app_id":"1061494059972503","namespace":"azwhatsapp","domains":["alazab.com","wa.alazab.com"]}'::jsonb),
  ('webhook', '{"url":"https://wa.alazab.com/webhooks/meta/whatsapp"}'::jsonb);