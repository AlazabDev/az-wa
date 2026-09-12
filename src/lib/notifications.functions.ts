import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getNotificationIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: membership, error: membershipError } = await context.supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) throw new Error("No active organization membership");

    const { data, error } = await (context.supabase.from as any)("notification_integrations")
      .select(
        `
        id, name, webhook_secret, recipient_numbers, status, created_at,
        whatsapp_numbers(id, display_phone_number)
      `,
      )
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  });

export const createNotificationIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { name: string; senderNumberId: string; recipientNumbers: string[] }) => input)
  .handler(async ({ data, context }) => {
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
      { p_org_id: membership.organization_id, p_permission: "integrations.manage" },
    );
    if (permissionError || !allowed) throw new Error("Forbidden");

    const { error } = await (context.supabase.from as any)("notification_integrations").insert({
      organization_id: membership.organization_id,
      name: data.name,
      sender_number_id: data.senderNumberId,
      recipient_numbers: data.recipientNumbers,
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteNotificationIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
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
      { p_org_id: membership.organization_id, p_permission: "integrations.manage" },
    );
    if (permissionError || !allowed) throw new Error("Forbidden");

    const { error } = await (context.supabase.from as any)("notification_integrations")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", membership.organization_id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
