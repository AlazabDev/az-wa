BEGIN;

-- ============================================================
-- Production security hardening
-- ============================================================

-- Remove any legacy role-only RLS policy from tenant-sensitive tables.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('contacts', 'messages')
      AND (
        COALESCE(qual, '') ILIKE '%get_user_role%'
        OR COALESCE(with_check, '') ILIKE '%get_user_role%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- Canonical contact policies.
DROP POLICY IF EXISTS contacts_select_tenant_members ON public.contacts;
DROP POLICY IF EXISTS contacts_insert_tenant_operators ON public.contacts;
DROP POLICY IF EXISTS contacts_update_tenant_operators ON public.contacts;
DROP POLICY IF EXISTS contacts_delete_tenant_operators ON public.contacts;

CREATE POLICY contacts_select_tenant_members ON public.contacts
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY contacts_insert_tenant_operators ON public.contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, 'operator'));
CREATE POLICY contacts_update_tenant_operators ON public.contacts
  FOR UPDATE TO authenticated
  USING (public.has_tenant_role(tenant_id, 'operator'))
  WITH CHECK (public.has_tenant_role(tenant_id, 'operator'));
CREATE POLICY contacts_delete_tenant_operators ON public.contacts
  FOR DELETE TO authenticated
  USING (public.has_tenant_role(tenant_id, 'operator'));

-- Canonical message policies.
DROP POLICY IF EXISTS messages_select_tenant_members ON public.messages;
DROP POLICY IF EXISTS messages_insert_tenant_operators ON public.messages;
DROP POLICY IF EXISTS messages_update_tenant_operators ON public.messages;
DROP POLICY IF EXISTS messages_delete_tenant_operators ON public.messages;

CREATE POLICY messages_select_tenant_members ON public.messages
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY messages_insert_tenant_operators ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, 'operator'));
CREATE POLICY messages_update_tenant_operators ON public.messages
  FOR UPDATE TO authenticated
  USING (public.has_tenant_role(tenant_id, 'operator'))
  WITH CHECK (public.has_tenant_role(tenant_id, 'operator'));
CREATE POLICY messages_delete_tenant_operators ON public.messages
  FOR DELETE TO authenticated
  USING (public.has_tenant_role(tenant_id, 'operator'));

-- Explicitly private legacy/reference tables. Policies are deny-all so the
-- database linter records the intentional posture while service_role bypasses RLS.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('contact_tag', 'message_template', 'user_permissions')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

REVOKE ALL ON public.contact_tag FROM anon, authenticated;
REVOKE ALL ON public.message_template FROM anon, authenticated;
REVOKE ALL ON public.user_permissions FROM anon, authenticated;

CREATE POLICY contact_tag_deny_client_access ON public.contact_tag
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY message_template_deny_client_access ON public.message_template
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY user_permissions_deny_client_access ON public.user_permissions
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Finance worker operational state is server-side only.
DROP POLICY IF EXISTS finance_worker_state_read ON public.finance_worker_state;
REVOKE ALL ON public.finance_worker_state FROM anon, authenticated;
GRANT ALL ON public.finance_worker_state TO service_role;

-- Prevent batch currency corruption. Totals are now stored per currency.
CREATE TABLE IF NOT EXISTS public.finance_batch_currency_totals (
  batch_id uuid NOT NULL REFERENCES public.finance_batches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  currency text NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  document_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, currency)
);
ALTER TABLE public.finance_batch_currency_totals ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.finance_batch_currency_totals TO authenticated;
GRANT ALL ON public.finance_batch_currency_totals TO service_role;
DROP POLICY IF EXISTS finance_batch_currency_totals_select ON public.finance_batch_currency_totals;
CREATE POLICY finance_batch_currency_totals_select ON public.finance_batch_currency_totals
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

-- Scoped claim RPC. Only service_role can execute it.
CREATE OR REPLACE FUNCTION public.claim_finance_documents_scoped(
  _tenant_id uuid,
  _batch_id uuid DEFAULT NULL,
  _limit integer DEFAULT 5,
  _lease_seconds integer DEFAULT 300
)
RETURNS SETOF public.finance_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.finance_documents d
  SET status = 'processing', locked_at = now(), attempts = d.attempts + 1
  WHERE d.id IN (
    SELECT q.id
    FROM public.finance_documents q
    WHERE q.tenant_id = _tenant_id
      AND (_batch_id IS NULL OR q.batch_id = _batch_id)
      AND (
        q.status = 'pending'
        OR (q.status = 'processing' AND q.locked_at < now() - make_interval(secs => _lease_seconds))
      )
      AND q.attempts < 3
    ORDER BY q.created_at
    LIMIT GREATEST(LEAST(_limit, 20), 1)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING d.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_finance_documents_scoped(uuid, uuid, integer, integer)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_finance_documents_scoped(uuid, uuid, integer, integer)
  TO service_role;

-- The old global claim endpoint must not be callable by clients either.
REVOKE ALL ON FUNCTION public.claim_finance_documents(integer, integer)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_finance_documents(integer, integer)
  TO service_role;

COMMIT;
