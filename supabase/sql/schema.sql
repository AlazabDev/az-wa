-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.ai_analysis_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  image_hash character varying NOT NULL UNIQUE,
  analysis_result jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval),
  CONSTRAINT ai_analysis_cache_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_extractions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  media_file_id uuid,
  message_id uuid,
  summary text,
  extracted_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  entities jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_text text,
  confidence numeric DEFAULT 0,
  model_used text DEFAULT 'claude-sonnet-4-20250514'::text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text])),
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone,
  tags ARRAY NOT NULL DEFAULT '{}'::text[],
  classification text,
  provider text,
  source_kind text,
  input_mime text,
  request_fingerprint text,
  raw_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ai_extractions_pkey PRIMARY KEY (id),
  CONSTRAINT ai_extractions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT ai_extractions_media_file_id_fkey FOREIGN KEY (media_file_id) REFERENCES public.media_files(id),
  CONSTRAINT ai_extractions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id)
);
CREATE TABLE public.api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_used_at timestamp with time zone,
  disabled_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT api_keys_pkey PRIMARY KEY (id),
  CONSTRAINT api_keys_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);
CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);
CREATE TABLE public.broadcast (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  template_name text NOT NULL,
  contact_tags ARRAY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  language text NOT NULL,
  scheduled_count integer,
  processed_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  CONSTRAINT broadcast_pkey PRIMARY KEY (id)
);
CREATE TABLE public.broadcast_batch (
  id uuid NOT NULL,
  broadcast_id uuid NOT NULL,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  scheduled_count integer NOT NULL,
  sent_count integer NOT NULL DEFAULT 0,
  status text,
  CONSTRAINT broadcast_batch_pkey PRIMARY KEY (id)
);
CREATE TABLE public.broadcast_contact (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL,
  contact_id numeric NOT NULL,
  wam_id text,
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  replied_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  read_at timestamp with time zone,
  batch_id uuid NOT NULL,
  reply_counted boolean NOT NULL DEFAULT false,
  processed_at timestamp with time zone,
  failed_at timestamp with time zone,
  CONSTRAINT broadcast_contact_pkey PRIMARY KEY (id)
);
CREATE TABLE public.broadcast_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  phone_e164 text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text, 'skipped'::text])),
  provider_message_id text,
  error_message text,
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT broadcast_messages_pkey PRIMARY KEY (id),
  CONSTRAINT broadcast_messages_broadcast_id_fkey FOREIGN KEY (broadcast_id) REFERENCES public.broadcasts(id),
  CONSTRAINT broadcast_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT broadcast_messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id)
);
CREATE TABLE public.broadcasts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  wa_number_id uuid NOT NULL,
  phone_number_id text NOT NULL,
  template_name text NOT NULL,
  template_language text NOT NULL DEFAULT 'ar'::text,
  template_components jsonb NOT NULL DEFAULT '[]'::jsonb,
  param_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'paused'::text])),
  total_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delay_ms integer NOT NULL DEFAULT 100,
  max_count integer,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT broadcasts_pkey PRIMARY KEY (id),
  CONSTRAINT broadcasts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT broadcasts_wa_number_id_fkey FOREIGN KEY (wa_number_id) REFERENCES public.wa_numbers(id)
);
CREATE TABLE public.chatbot_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  wa_number_id uuid,
  trigger_type text NOT NULL CHECK (trigger_type = ANY (ARRAY['keyword'::text, 'regex'::text, 'any'::text, 'first_message'::text])),
  trigger_value text,
  response_type text NOT NULL CHECK (response_type = ANY (ARRAY['text'::text, 'template'::text, 'human_takeover'::text, 'ai_reply'::text])),
  response_text text,
  template_name text,
  template_language text DEFAULT 'ar'::text,
  template_params jsonb DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chatbot_rules_pkey PRIMARY KEY (id),
  CONSTRAINT chatbot_rules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT chatbot_rules_wa_number_id_fkey FOREIGN KEY (wa_number_id) REFERENCES public.wa_numbers(id)
);
CREATE TABLE public.contact_tag (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT contact_tag_pkey PRIMARY KEY (id)
);
CREATE TABLE public.contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  phone_e164 text NOT NULL,
  display_name text,
  wa_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  in_chat boolean NOT NULL DEFAULT false,
  tags ARRAY,
  unread_count integer,
  last_message_received_at timestamp with time zone,
  assigned_to uuid,
  CONSTRAINT contacts_pkey PRIMARY KEY (id),
  CONSTRAINT contacts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT contacts_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id)
);
CREATE TABLE public.conversation_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  note text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT conversation_notes_pkey PRIMARY KEY (id),
  CONSTRAINT conversation_notes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT conversation_notes_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
);
CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  wa_number_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'open'::conv_status,
  assigned_to uuid,
  last_message_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  chatbot_state text DEFAULT 'active'::text CHECK (chatbot_state = ANY (ARRAY['active'::text, 'human_takeover'::text, 'paused'::text])),
  last_ai_analysis jsonb,
  CONSTRAINT conversations_pkey PRIMARY KEY (id),
  CONSTRAINT conversations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT conversations_wa_number_id_fkey FOREIGN KEY (wa_number_id) REFERENCES public.wa_numbers(id),
  CONSTRAINT conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id)
);
CREATE TABLE public.job_queue (
  id bigint NOT NULL DEFAULT nextval('job_queue_id_seq'::regclass),
  tenant_id uuid NOT NULL,
  job_type USER-DEFINED NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_after timestamp with time zone NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 10,
  locked_at timestamp with time zone,
  locked_by text,
  last_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT job_queue_pkey PRIMARY KEY (id),
  CONSTRAINT job_queue_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);
CREATE TABLE public.media_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  message_id uuid,
  kind USER-DEFINED NOT NULL DEFAULT 'other'::media_kind,
  mime text,
  size_bytes bigint,
  storage_bucket text NOT NULL DEFAULT 'wa-media'::text,
  storage_key text UNIQUE,
  sha256 text,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  folder_id uuid,
  file_name text,
  wa_media_id text,
  ai_tags ARRAY NOT NULL DEFAULT '{}'::text[],
  ai_summary text,
  ai_status text NOT NULL DEFAULT 'pending'::text,
  ai_processed_at timestamp with time zone,
  ai_last_extraction_id uuid,
  CONSTRAINT media_files_pkey PRIMARY KEY (id),
  CONSTRAINT media_files_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT media_files_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id),
  CONSTRAINT media_files_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.media_folders(id),
  CONSTRAINT media_files_ai_last_extraction_id_fkey FOREIGN KEY (ai_last_extraction_id) REFERENCES public.ai_extractions(id)
);
CREATE TABLE public.media_folders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#6366f1'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT media_folders_pkey PRIMARY KEY (id),
  CONSTRAINT media_folders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);
CREATE TABLE public.message_template (
  id text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  previous_category text,
  status text,
  language text NOT NULL,
  components jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT message_template_pkey PRIMARY KEY (id)
);
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  direction USER-DEFINED NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'queued'::msg_status,
  text text,
  provider_message_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  delivered_at timestamp with time zone,
  read_at timestamp with time zone,
  sent_at timestamp with time zone,
  is_received boolean NOT NULL DEFAULT false,
  read_by_user_at timestamp with time zone,
  failed_at timestamp with time zone,
  chat_id text,
  type text DEFAULT 'text'::text,
  timestamp timestamp with time zone DEFAULT now(),
  is_ai_generated boolean NOT NULL DEFAULT false,
  media_wa_id text,
  media_mime text,
  media_filename text,
  interactive_payload jsonb,
  error_payload jsonb,
  raw_payload jsonb,
  wa_conversation_id text,
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
);
CREATE TABLE public.permissions (
  id integer NOT NULL DEFAULT nextval('permissions_id_seq'::regclass),
  name text NOT NULL UNIQUE,
  description text,
  resource text NOT NULL,
  action text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT permissions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text,
  name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_updated timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.role_permissions (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  role USER-DEFINED NOT NULL,
  permission USER-DEFINED NOT NULL,
  CONSTRAINT role_permissions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.setup (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying,
  display_text text NOT NULL,
  sequence integer,
  done_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  in_progress boolean NOT NULL DEFAULT false,
  CONSTRAINT setup_pkey PRIMARY KEY (id)
);
CREATE TABLE public.templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  wa_account_id uuid NOT NULL,
  name text NOT NULL,
  category USER-DEFINED NOT NULL DEFAULT 'UTILITY'::tmpl_category,
  language text NOT NULL DEFAULT 'ar'::text,
  status USER-DEFINED NOT NULL DEFAULT 'PENDING'::tmpl_status,
  body text,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT templates_pkey PRIMARY KEY (id),
  CONSTRAINT templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT templates_wa_account_id_fkey FOREIGN KEY (wa_account_id) REFERENCES public.wa_accounts(id)
);
CREATE TABLE public.tenant_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role USER-DEFINED NOT NULL DEFAULT 'viewer'::member_role,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tenant_members_pkey PRIMARY KEY (id),
  CONSTRAINT tenant_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT tenant_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.tenants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tenants_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_permissions (
  user_id uuid NOT NULL,
  permission_id integer NOT NULL,
  granted_by uuid,
  granted_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  CONSTRAINT user_permissions_pkey PRIMARY KEY (user_id, permission_id),
  CONSTRAINT user_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id),
  CONSTRAINT user_permissions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.user_profiles(id),
  CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id)
);
CREATE TABLE public.user_profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  full_name text,
  role USER-DEFINED NOT NULL DEFAULT 'viewer'::user_role,
  phone text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_login timestamp with time zone,
  is_active boolean DEFAULT true,
  permissions jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_roles (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid NOT NULL,
  role USER-DEFINED NOT NULL,
  CONSTRAINT user_roles_pkey PRIMARY KEY (id),
  CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.wa_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  label text NOT NULL,
  waba_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  business_manager_id text,
  business_name text,
  currency text,
  timezone_id text,
  template_namespace text,
  app_bindings jsonb NOT NULL DEFAULT '[]'::jsonb,
  webhook_subscriptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT wa_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT wa_accounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);
CREATE TABLE public.wa_numbers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  wa_account_id uuid NOT NULL,
  phone_e164 text NOT NULL,
  phone_number_id text NOT NULL,
  type USER-DEFINED NOT NULL DEFAULT 'connected'::wa_number_type,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_active_at timestamp with time zone,
  display_phone_number text,
  verified_name text,
  quality_rating text,
  account_mode text,
  platform_type text,
  throughput jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT wa_numbers_pkey PRIMARY KEY (id),
  CONSTRAINT wa_numbers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT wa_numbers_wa_account_id_fkey FOREIGN KEY (wa_account_id) REFERENCES public.wa_accounts(id)
);
CREATE TABLE public.webhook_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  webhook_endpoint_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_code integer,
  success boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT webhook_deliveries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT webhook_deliveries_webhook_endpoint_id_fkey FOREIGN KEY (webhook_endpoint_id) REFERENCES public.webhook_endpoints(id)
);
CREATE TABLE public.webhook_endpoints (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  url text NOT NULL,
  secret_hash text,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT webhook_endpoints_pkey PRIMARY KEY (id),
  CONSTRAINT webhook_endpoints_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);
CREATE TABLE public.workflow_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  trigger_event text,
  status text NOT NULL DEFAULT 'pending'::text,
  log jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT workflow_runs_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_runs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT workflow_runs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id)
);
CREATE TABLE public.workflows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT workflows_pkey PRIMARY KEY (id),
  CONSTRAINT workflows_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);