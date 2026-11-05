REVOKE ALL ON FUNCTION public.increment_unread(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_unread(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.increment_unread(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_unread(uuid) TO service_role;