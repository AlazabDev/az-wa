
-- Fix search_path on set_updated_at function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- job_queue: intentionally no client policies (service role only)
-- Add an explicit deny policy for safety
CREATE POLICY "job_queue_no_client_access" ON public.job_queue FOR ALL TO authenticated USING (false);
