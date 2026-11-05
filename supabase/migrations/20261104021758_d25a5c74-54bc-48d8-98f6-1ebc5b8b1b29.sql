CREATE OR REPLACE FUNCTION public.increment_unread(p_conversation_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.conversations
  SET unread_count = unread_count + 1,
      updated_at = now()
  WHERE id = p_conversation_id;
$$;

REVOKE ALL ON FUNCTION public.increment_unread(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_unread(uuid) TO service_role;