import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// These handlers keep auth/RBAC at the server boundary and never expose App
// Access Token, App Secret or Verify Token to the browser.
export const inspectMetaWebhookSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(() => z.object({}))
  .handler(async ({ context }) => {
    const { data: membership, error } = await context.supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (error || !membership) throw new Error("No active organization membership");

    const { data: allowed, error: permissionError } = await context.supabase.rpc(
      "azwa_has_org_permission",
      { p_org_id: membership.organization_id, p_permission: "credentials.manage" },
    );
    if (permissionError || !allowed) throw new Error("Forbidden");

    const { inspectMetaAppWebhook } = await import("./app-webhook.server");
    return inspectMetaAppWebhook(membership.organization_id);
  });

export const reconcileMetaWebhookSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(() => z.object({}))
  .handler(async ({ context }) => {
    const { data: membership, error } = await context.supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (error || !membership) throw new Error("No active organization membership");

    const { data: allowed, error: permissionError } = await context.supabase.rpc(
      "azwa_has_org_permission",
      { p_org_id: membership.organization_id, p_permission: "credentials.manage" },
    );
    if (permissionError || !allowed) throw new Error("Forbidden");

    const { reconcileMetaAppWebhook } = await import("./app-webhook.server");
    return reconcileMetaAppWebhook(membership.organization_id);
  });
