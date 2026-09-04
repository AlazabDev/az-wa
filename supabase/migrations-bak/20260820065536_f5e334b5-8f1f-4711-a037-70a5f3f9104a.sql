-- 1) Finance WhatsApp account + number
INSERT INTO public.wa_accounts (tenant_id, label, waba_id, business_name, meta)
VALUES ('f8a358c7-0333-4115-a50b-893725955973', 'Alazab Finance', '1527103499063250', 'Alazab Finance', '{"purpose":"finance"}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO public.wa_numbers (tenant_id, wa_account_id, phone_e164, phone_number_id, type, status, display_phone_number, verified_name, meta)
SELECT a.tenant_id, a.id, '+201146395966', '1197837903405393', 'connected', 'active', '+201146395966', 'Alazab Finance', '{"purpose":"finance","token_secret":"WA_FINANCE_TOKEN"}'::jsonb
FROM public.wa_accounts a
WHERE a.waba_id = '1527103499063250'
  AND NOT EXISTS (SELECT 1 FROM public.wa_numbers n WHERE n.phone_number_id = '1197837903405393');

-- 2) Report batches
CREATE TABLE public.finance_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_phone text,
  status text NOT NULL DEFAULT 'open',
  total_documents integer NOT NULL DEFAULT 0,
  processed_documents integer NOT NULL DEFAULT 0,
  failed_documents integer NOT NULL DEFAULT 0,
  currency text,
  total_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_batches TO authenticated;
GRANT ALL ON public.finance_batches TO service_role;
ALTER TABLE public.finance_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_batches_select" ON public.finance_batches FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "finance_batches_write" ON public.finance_batches FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'operator')) WITH CHECK (public.has_tenant_role(tenant_id, 'operator'));
CREATE TRIGGER finance_batches_updated_at BEFORE UPDATE ON public.finance_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Finance documents
CREATE TABLE public.finance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.finance_batches(id) ON DELETE SET NULL,
  wa_number_id uuid REFERENCES public.wa_numbers(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  from_phone text,
  media_wa_id text,
  file_name text,
  mime text,
  size_bytes bigint,
  sha256 text,
  storage_provider text NOT NULL DEFAULT 'minio',
  storage_bucket text,
  object_key text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  locked_at timestamptz,
  error_message text,
  ocr_text text,
  vision_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  agent_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  doc_type text,
  vendor text,
  invoice_number text,
  invoice_date date,
  currency text,
  total_amount numeric,
  tax_amount numeric,
  confidence numeric,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, media_wa_id)
);
CREATE INDEX finance_documents_queue_idx ON public.finance_documents (status, created_at);
CREATE INDEX finance_documents_tenant_idx ON public.finance_documents (tenant_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_documents TO authenticated;
GRANT ALL ON public.finance_documents TO service_role;
ALTER TABLE public.finance_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_documents_select" ON public.finance_documents FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "finance_documents_write" ON public.finance_documents FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'operator')) WITH CHECK (public.has_tenant_role(tenant_id, 'operator'));
CREATE TRIGGER finance_documents_updated_at BEFORE UPDATE ON public.finance_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Worker state (single-flight + circuit breaker)
CREATE TABLE public.finance_worker_state (
  id text PRIMARY KEY,
  is_paused boolean NOT NULL DEFAULT false,
  paused_reason text,
  lease_until timestamptz,
  last_run_at timestamptz,
  last_error text,
  processed_total bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_worker_state TO authenticated;
GRANT ALL ON public.finance_worker_state TO service_role;
ALTER TABLE public.finance_worker_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_worker_state_read" ON public.finance_worker_state FOR SELECT TO authenticated USING (true);
CREATE TRIGGER finance_worker_state_updated_at BEFORE UPDATE ON public.finance_worker_state FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.finance_worker_state (id) VALUES ('finance-media-worker');

-- 5) Claim function: bounded batch with single-flight lease
CREATE OR REPLACE FUNCTION public.claim_finance_documents(_limit integer DEFAULT 5, _lease_seconds integer DEFAULT 300)
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
    SELECT id FROM public.finance_documents
    WHERE (status = 'pending' OR (status = 'processing' AND locked_at < now() - make_interval(secs => _lease_seconds)))
      AND attempts < 3
    ORDER BY created_at
    LIMIT GREATEST(_limit, 1)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING d.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_finance_documents(integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_finance_documents(integer, integer) TO service_role;