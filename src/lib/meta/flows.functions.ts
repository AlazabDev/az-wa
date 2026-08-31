/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_FLOW_CATEGORIES = new Set([
  "SIGN_UP",
  "SIGN_IN",
  "APPOINTMENT_BOOKING",
  "LEAD_GENERATION",
  "CONTACT_US",
  "CUSTOMER_SUPPORT",
  "SURVEY",
  "OTHER",
]);

function validateCategories(categories: string[]) {
  const normalized = [...new Set((categories ?? []).map((value) => value.trim().toUpperCase()).filter(Boolean))];
  if (normalized.length === 0) throw new Error("At least one Flow category is required");
  const invalid = normalized.filter((value) => !ALLOWED_FLOW_CATEGORIES.has(value));
  if (invalid.length) throw new Error(`Unsupported Flow categories: ${invalid.join(", ")}`);
  return normalized;
}

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

export const createFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    wabaId: string;
    name: string;
    categories: string[];
    endpointUri?: string;
    cloneFlowId?: string;
  }) => {
    if (!input?.wabaId) throw new Error("WABA is required");
    if (!input?.name?.trim()) throw new Error("Flow name is required");
    return {
      ...input,
      name: input.name.trim(),
      categories: validateCategories(input.categories),
      endpointUri: input.endpointUri?.trim() || undefined,
      cloneFlowId: input.cloneFlowId?.trim() || undefined,
    };
  })
  .handler(async ({ data, context }) => {
    await requireWabaManage(context, data.wabaId);
    const { createWhatsappFlow } = await import("./flows.server");
    return createWhatsappFlow(data);
  });

export const updateFlowMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    flowId: string;
    name: string;
    categories: string[];
    endpointUri?: string;
  }) => {
    if (!input?.flowId) throw new Error("Flow is required");
    if (!input?.name?.trim()) throw new Error("Flow name is required");
    return {
      ...input,
      name: input.name.trim(),
      categories: validateCategories(input.categories),
      endpointUri: input.endpointUri?.trim() || undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const wabaId = await resolveFlowWaba(data.flowId);
    await requireWabaManage(context, wabaId);
    const { updateWhatsappFlowMetadata } = await import("./flows.server");
    return updateWhatsappFlowMetadata(data);
  });

export const uploadFlowJson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { flowId: string; flowJson: string }) => {
    if (!input?.flowId) throw new Error("Flow is required");
    if (!input?.flowJson?.trim()) throw new Error("Flow JSON is required");
    if (input.flowJson.length > 2_000_000) throw new Error("Flow JSON exceeds the 2 MB AzWA editor limit");
    return { flowId: input.flowId, flowJson: input.flowJson.trim() };
  })
  .handler(async ({ data, context }) => {
    const wabaId = await resolveFlowWaba(data.flowId);
    await requireWabaManage(context, wabaId);
    const { uploadWhatsappFlowJson } = await import("./flows.server");
    return uploadWhatsappFlowJson(data);
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
