import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AuthOrganizationScope = {
  tenant_id: string;
  role: string;
};

const ROLE_PRIORITY: Record<string, number> = {
  owner: 500,
  admin: 400,
  operator: 300,
  marketer: 200,
  viewer: 100,
};

export const getAuthenticatedOrganizationScopes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: Record<string, never>) => input)
  .handler(async ({ context }): Promise<AuthOrganizationScope[]> => {
    const { supabaseRuntimeAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runtime = supabaseRuntimeAdmin as any;

    const { data: memberships, error: membershipError } = await runtime
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", context.userId)
      .eq("status", "active");
    if (membershipError) throw new Error(membershipError.message);

    const organizationIds = [...new Set((memberships ?? []).map((row: { organization_id: string }) => row.organization_id))];
    if (organizationIds.length === 0) return [];

    const { data: assignments, error: assignmentError } = await runtime
      .from("user_roles")
      .select("organization_id, role_id")
      .eq("user_id", context.userId)
      .in("organization_id", organizationIds);
    if (assignmentError) throw new Error(assignmentError.message);

    const roleIds = [...new Set((assignments ?? []).map((row: { role_id: string }) => row.role_id))];
    const roleById = new Map<string, string>();
    if (roleIds.length > 0) {
      const { data: roles, error: roleError } = await runtime
        .from("roles")
        .select("id, code")
        .in("id", roleIds);
      if (roleError) throw new Error(roleError.message);
      for (const role of roles ?? []) roleById.set(String(role.id), String(role.code));
    }

    return organizationIds.map((organizationId) => {
      const codes = (assignments ?? [])
        .filter((row: { organization_id: string }) => row.organization_id === organizationId)
        .map((row: { role_id: string }) => roleById.get(String(row.role_id)))
        .filter((value: string | undefined): value is string => Boolean(value))
        .sort((a: string, b: string) => (ROLE_PRIORITY[b] ?? 0) - (ROLE_PRIORITY[a] ?? 0));

      return {
        tenant_id: organizationId,
        role: codes[0] ?? "member",
      };
    });
  });
