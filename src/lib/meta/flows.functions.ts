/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireWabaManage(context: any, wabaId: string) {
  const { data: waba, error } = await context.supabase
    .from("wabas")
    .select("id,organization_id")
    .eq("id", wabaId)
    .maybeSingle();
  if (error || !waba) throw new Error("WABA not found or not accessible");

  const { data: allowed, error: permissionError } = await context.supabase.rpc(
    "azwa_has_org_permission",
    { p_org_id: waba.organization_id, p_permission: "wabas.manage" },
  );
  if (permissionError || !allowed) throw new Error("Forbidden");
  return waba;
}

async function resolveFlowWaba(flowId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("whatsapp_flows")
    .select("waba_id")
    .eq("id", flowId)
    .maybeSingle();
  if (error || !data) throw new Error("Flow not found");
  return String(data.waba_id);
}

export const syncWhatsappFlows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { wabaId: string }) => {
    if (!input?.wabaId) throw new Error("WABA is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    await requireWabaManage(context, data.wabaId);
    const { syncWabaFlows } = await import("./flows.server");
    return syncWabaFlows(data.wabaId);
  });

export const publishFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { flowId: string }) => input)
  .handler(async ({ data, context }) => {
    const wabaId = await resolveFlowWaba(data.flowId);
    await requireWabaManage(context, wabaId);
    const { publishWhatsappFlow } = await import("./flows.server");
    return publishWhatsappFlow(data.flowId);
  });

export const deprecateFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { flowId: string }) => input)
  .handler(async ({ data, context }) => {
    const wabaId = await resolveFlowWaba(data.flowId);
    await requireWabaManage(context, wabaId);
    const { deprecateWhatsappFlow } = await import("./flows.server");
    return deprecateWhatsappFlow(data.flowId);
  });

export const deleteDraftFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { flowId: string }) => input)
  .handler(async ({ data, context }) => {
    const wabaId = await resolveFlowWaba(data.flowId);
    await requireWabaManage(context, wabaId);
    const { deleteDraftWhatsappFlow } = await import("./flows.server");
    return deleteDraftWhatsappFlow(data.flowId);
  });
