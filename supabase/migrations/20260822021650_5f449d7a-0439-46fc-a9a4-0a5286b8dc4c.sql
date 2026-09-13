-- 1) finance_worker_state: remove global read access
DROP POLICY IF EXISTS finance_worker_state_read ON public.finance_worker_state;
REVOKE ALL ON public.finance_worker_state FROM anon, authenticated;
GRANT ALL ON public.finance_worker_state TO service_role;

-- 2) hub_dispatch_targets: signing secret must never be readable by clients
ALTER TABLE public.hub_dispatch_targets
  ADD COLUMN IF NOT EXISTS has_secret boolean
  GENERATED ALWAYS AS (secret IS NOT NULL AND secret <> '') STORED;

REVOKE SELECT ON public.hub_dispatch_targets FROM anon, authenticated;

GRANT SELECT (
  id, tenant_id, name, url, is_active, events_filter, numbers_filter,
  timeout_ms, retry_count, success_rate, last_delivery_at, last_error,
  created_at, updated_at, has_secret
) ON public.hub_dispatch_targets TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.hub_dispatch_targets TO authenticated;
GRANT ALL ON public.hub_dispatch_targets TO service_role;