-- accounts
CREATE TABLE public.whatsapp_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  display_name text NOT NULL,
  phone_number text,
  phone_number_id text NOT NULL,
  waba_id text,
  status text NOT NULL DEFAULT 'pending',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phone_number_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_accounts TO authenticated;
GRANT ALL ON public.whatsapp_accounts TO service_role;
ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own accounts" ON public.whatsapp_accounts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_wa_accounts_updated BEFORE UPDATE ON public.whatsapp_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- per-account access tokens: backend only
CREATE TABLE public.whatsapp_account_secrets (
  account_id uuid NOT NULL PRIMARY KEY REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_account_secrets TO service_role;
ALTER TABLE public.whatsapp_account_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only" ON public.whatsapp_account_secrets FOR ALL TO service_role USING (true) WITH CHECK (true);

-- media archive
CREATE TABLE public.media_files (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  wa_media_id text,
  file_name text NOT NULL,
  mime_type text,
  media_type text,
  size_bytes bigint,
  storage_key text,
  storage_url text,
  status text NOT NULL DEFAULT 'stored',
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_files TO authenticated;
GRANT ALL ON public.media_files TO service_role;
ALTER TABLE public.media_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own media" ON public.media_files FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_media_updated BEFORE UPDATE ON public.media_files FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_media_user ON public.media_files(user_id, received_at DESC);

-- link existing data to accounts
ALTER TABLE public.contacts ADD COLUMN account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.conversations ADD COLUMN account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN wa_message_id text;
CREATE INDEX idx_contacts_account ON public.contacts(account_id);
CREATE INDEX idx_conversations_account ON public.conversations(account_id);
CREATE INDEX idx_messages_account ON public.messages(account_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.media_files;