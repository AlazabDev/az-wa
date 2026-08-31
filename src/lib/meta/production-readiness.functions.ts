import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMetaProductionReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, never>) => input)
  .handler(async ({ context }) => {
    const { data: membership, error: membershipError } = await context.supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) throw new Error("No active organization membership");

    const { data: allowed, error: permissionError } = await context.supabase.rpc(
      "azwa_has_org_permission",
      { p_org_id: membership.organization_id, p_permission: "health.read" },
    );
    if (permissionError || !allowed) throw new Error("Forbidden");

    const { buildMetaProductionReadiness } = await import("./production-readiness.server");
    return buildMetaProductionReadiness(membership.organization_id);
  });
