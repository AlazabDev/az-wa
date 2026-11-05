-- Restore objects missing from the already-recorded 20260919063557 migration.

CREATE OR REPLACE FUNCTION public.azwa_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  display_name text NOT NULL,
  phone_number text,
  phone_number_id text NOT NULL UNIQUE,
  waba_id text,
  status text NOT NULL DEFAULT 'pending',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_accounts TO authenticated;
GRANT ALL ON public.whatsapp_accounts TO service_role;
ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own accounts" ON public.whatsapp_accounts;
CREATE POLICY "own accounts" ON public.whatsapp_accounts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS t_wa_accounts_updated ON public.whatsapp_accounts;
CREATE TRIGGER t_wa_accounts_updated
  BEFORE UPDATE ON public.whatsapp_accounts
  FOR EACH ROW EXECUTE FUNCTION public.azwa_set_updated_at();

CREATE TABLE IF NOT EXISTS public.whatsapp_account_secrets (
  account_id uuid PRIMARY KEY REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_account_secrets TO service_role;
ALTER TABLE public.whatsapp_account_secrets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service only" ON public.whatsapp_account_secrets;
CREATE POLICY "service only" ON public.whatsapp_account_secrets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.media_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
DROP POLICY IF EXISTS "own media" ON public.media_files;
CREATE POLICY "own media" ON public.media_files
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS t_media_updated ON public.media_files;
CREATE TRIGGER t_media_updated
  BEFORE UPDATE ON public.media_files
  FOR EACH ROW EXECUTE FUNCTION public.azwa_set_updated_at();
CREATE INDEX IF NOT EXISTS idx_media_user
  ON public.media_files(user_id, received_at DESC);

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS account_id uuid
  REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS account_id uuid
  REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS account_id uuid
  REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS wa_message_id text;

CREATE INDEX IF NOT EXISTS idx_contacts_account
  ON public.contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_conversations_account
  ON public.conversations(account_id);
CREATE INDEX IF NOT EXISTS idx_messages_account
  ON public.messages(account_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public' AND tablename = 'messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public' AND tablename = 'conversations'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public' AND tablename = 'media_files'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.media_files;
    END IF;
  END IF;
END;
$$;
