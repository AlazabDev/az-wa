import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WabaStats = Record<
  string,
  {
    templates: number;
    messages: number;
    openErrors: number;
  }
>;

export const getWabaStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: Record<string, never>) => input)
  .handler(async ({ context }): Promise<WabaStats> => {
    const { supabaseAdmin, supabaseRuntimeAdmin } =
      await import("@/integrations/supabase/client.server");

    const { data: organization, error: organizationError } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("slug", "alazab-group")
      .maybeSingle();
    if (organizationError || !organization?.id) {
      throw new Error(organizationError?.message ?? "AzWA organization not found");
    }

    const { data: allowed, error: permissionError } = await context.supabase.rpc(
      "azwa_has_org_permission",
      { p_org_id: organization.id, p_permission: "wabas.read" },
    );
    if (permissionError || !allowed) throw new Error("Forbidden");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runtime = supabaseRuntimeAdmin as any;
    const [wabaResult, numberResult, templateResult, messageResult, errorResult] =
      await Promise.all([
        runtime.from("wabas").select("id").eq("organization_id", organization.id),
        runtime
          .from("whatsapp_numbers")
          .select("id,waba_id")
          .eq("organization_id", organization.id),
        runtime.from("templates").select("waba_id").eq("organization_id", organization.id),
        runtime
          .from("messages")
          .select("whatsapp_number_id")
          .eq("organization_id", organization.id),
        runtime
          .from("api_errors")
          .select("waba_id")
          .eq("organization_id", organization.id)
          .eq("status", "open"),
      ]);

    for (const result of [wabaResult, numberResult, templateResult, messageResult, errorResult]) {
      if (result.error) throw new Error(result.error.message);
    }

    const stats: WabaStats = {};
    for (const row of wabaResult.data ?? []) {
      stats[String(row.id)] = { templates: 0, messages: 0, openErrors: 0 };
    }

    const numberToWaba = new Map<string, string>();
    for (const row of numberResult.data ?? []) {
      numberToWaba.set(String(row.id), String(row.waba_id));
    }

    for (const row of templateResult.data ?? []) {
      const wabaId = String(row.waba_id);
      if (stats[wabaId]) stats[wabaId].templates += 1;
    }

    for (const row of messageResult.data ?? []) {
      const numberId = row.whatsapp_number_id ? String(row.whatsapp_number_id) : null;
      const wabaId = numberId ? numberToWaba.get(numberId) : null;
      if (wabaId && stats[wabaId]) stats[wabaId].messages += 1;
    }

    for (const row of errorResult.data ?? []) {
      const wabaId = row.waba_id ? String(row.waba_id) : null;
      if (wabaId && stats[wabaId]) stats[wabaId].openErrors += 1;
    }

    return stats;
  });
