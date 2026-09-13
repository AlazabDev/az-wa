import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RefreshNumberMetaDataResponse = {
  ok: boolean;
  detail: string;
};

export type SetNumberEnabledResponse = {
  ok: boolean;
  detail: string;
};

export const refreshNumberMetaData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { numberId: string }) => input)
  .handler(async ({ data, context }): Promise<RefreshNumberMetaDataResponse> => {
    const { data: number, error: numberError } = await context.supabase
      .from("whatsapp_numbers")
      .select("id, organization_id, meta_phone_number_id")
      .eq("id", data.numberId)
      .maybeSingle();

    if (numberError || !number) {
      return {
        ok: false,
        detail: "WhatsApp number not found or not accessible",
      };
    }

    const { data: allowed, error: permissionError } = await context.supabase.rpc(
      "azwa_has_org_permission",
      { p_org_id: number.organization_id, p_permission: "numbers.manage" },
    );

    if (permissionError || !allowed) {
      return {
        ok: false,
        detail: "Forbidden",
      };
    }

    try {
      const { syncNumberMetadata } = await import("./number-admin.server");
      await syncNumberMetadata(data.numberId);

      return {
        ok: true,
        detail: `Successfully refreshed metadata for ${number.meta_phone_number_id}`,
      };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : "Failed to refresh metadata",
      };
    }
  });

export const setNumberEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { numberId: string; enabled: boolean }) => input)
  .handler(async ({ data, context }): Promise<SetNumberEnabledResponse> => {
    const { data: number, error: numberError } = await context.supabase
      .from("whatsapp_numbers")
      .select("id, organization_id")
      .eq("id", data.numberId)
      .maybeSingle();

    if (numberError || !number) {
      return {
        ok: false,
        detail: "WhatsApp number not found or not accessible",
      };
    }

    const { data: allowed, error: permissionError } = await context.supabase.rpc(
      "azwa_has_org_permission",
      { p_org_id: number.organization_id, p_permission: "numbers.manage" },
    );

    if (permissionError || !allowed) {
      return {
        ok: false,
        detail: "Forbidden",
      };
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("whatsapp_numbers")
        .update({
          is_enabled: data.enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("id", number.id)
        .eq("organization_id", number.organization_id)
        .select("is_enabled")
        .single();

      if (updateError || !updated) {
        return {
          ok: false,
          detail: updateError?.message ?? "Unable to update number state",
        };
      }

      if (updated.is_enabled !== data.enabled) {
        return {
          ok: false,
          detail: data.enabled
            ? "Number cannot be enabled in its current lifecycle state"
            : "Number could not be disabled",
        };
      }

      return {
        ok: true,
        detail: `Number ${data.enabled ? "enabled" : "disabled"} successfully`,
      };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : "Update failed",
      };
    }
  });