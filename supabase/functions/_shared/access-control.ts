import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface AuthenticatedUserContext {
  userId: string;
  supabase: any;
}

function getBearerToken(request: Request): string | null {
  const value = request.headers.get("authorization");
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Accept only server-to-server calls carrying the configured service key. */
export function isTrustedServiceRequest(request: Request): boolean {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return Boolean(key && getBearerToken(request) === key);
}

/** Validate a caller's Supabase access token and return an RLS-scoped client. */
export async function getAuthenticatedUser(
  request: Request,
): Promise<AuthenticatedUserContext | null> {
  const token = getBearerToken(request);
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!token || !url || !anonKey) return null;

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id, supabase };
}

export async function hasOrganizationPermission(
  user: AuthenticatedUserContext,
  organizationId: string,
  permission: string,
): Promise<boolean> {
  const { data, error } = await user.supabase.rpc("azwa_has_org_permission", {
    p_org_id: organizationId,
    p_permission: permission,
  });
  return !error && data === true;
}

export async function getOrganizationIdBySlug(slug: string): Promise<string | null> {
  const serviceClient = createServiceClient();
  if (!serviceClient) return null;
  const { data, error } = await serviceClient
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return error || !data?.id ? null : String(data.id);
}

/** Check legacy tenant membership for endpoints that still use tenant_id tables. */
export async function hasTenantRole(
  userId: string,
  tenantId: string,
  allowedRoles: readonly string[],
): Promise<boolean> {
  const serviceClient = createServiceClient();
  if (!serviceClient) return false;
  const { data, error } = await serviceClient
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  return !error && Boolean(data?.role && allowedRoles.includes(String(data.role)));
}