/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WhatsApp Flows control-plane integration — server only.
 * Flow state is WABA-scoped and reconciled from Meta without deleting history.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MetaGraphClient, resolveCredential } from "./graph.server";
import { loadWabaScope, type WabaScope } from "./templates.server";

export const FLOW_CATEGORIES = [
  "SIGN_UP",
  "SIGN_IN",
  "APPOINTMENT_BOOKING",
  "LEAD_GENERATION",
  "CONTACT_US",
  "CUSTOMER_SUPPORT",
  "SURVEY",
  "OTHER",
] as const;

export type MetaFlow = {
  id: string;
  name: string;
  status?: string;
  categories?: string[];
  validation_errors?: unknown[];
  json_version?: string;
  data_api_version?: string;
  data_channel_uri?: string;
  preview?: { preview_url?: string; expires_at?: string | number };
  health_status?: unknown;
  application?: unknown;
};

type MetaFlowPage = {
  data?: MetaFlow[];
  paging?: { cursors?: { after?: string }; next?: string };
};

type StoredFlow = {
  id: string;
  waba_id: string;
  meta_flow_id: string;
  status: string;
};

async function clientForWaba(waba: WabaScope) {
  const credential = await resolveCredential({
    wabaId: waba.id,
    businessPortfolioId: waba.business_portfolio_id,
  });
  if (!credential.token) return null;
  return new MetaGraphClient(credential.token, {
    organizationId: waba.organization_id,
    wabaId: waba.id,
    businessPortfolioId: waba.business_portfolio_id,
  });
}

async function collectFlows(client: MetaGraphClient, metaWabaId: string) {
  const collected: MetaFlow[] = [];
  const seen = new Set<string>();
  let after: string | undefined;

  for (let page = 0; page < 100; page += 1) {
    const query: Record<string, string> = {
      limit: "100",
      fields: [
        "id",
        "name",
        "status",
        "categories",
        "validation_errors",
        "json_version",
        "data_api_version",
        "data_channel_uri",
        "preview",
        "health_status",
        "application",
      ].join(","),
    };
    if (after) query["after"] = after;

    const response = await client.request<MetaFlowPage>(`${metaWabaId}/flows`, { query });
    if (!response.ok) {
      return { ok: false as const, flows: collected, error: response.errorMessage ?? "Graph error" };
    }

    collected.push(...(response.data?.data ?? []));
    const next = response.data?.paging?.next ? response.data.paging.cursors?.after : undefined;
    if (!next || seen.has(next)) break;
    seen.add(next);
    after = next;
  }

  return { ok: true as const, flows: collected };
}

function flowRow(waba: WabaScope, flow: MetaFlow, now: string) {
  return {
    organization_id: waba.organization_id,
    waba_id: waba.id,
    meta_flow_id: flow.id,
    name: flow.name,
    status: String(flow.status ?? "DRAFT").toUpperCase(),
    categories: flow.categories ?? [],
    validation_errors: flow.validation_errors ?? [],
    json_version: flow.json_version ?? null,
    data_api_version: flow.data_api_version ?? null,
    endpoint_uri: flow.data_channel_uri ?? null,
    preview_url: flow.preview?.preview_url ?? null,
    metadata: {
      source: "meta_graph_v26",
      preview_expires_at: flow.preview?.expires_at ?? null,
      health_status: flow.health_status ?? null,
      application: flow.application ?? null,
    },
    last_synced_at: now,
    updated_at: now,
  };
}

export async function syncWabaFlows(wabaId: string) {
  const waba = await loadWabaScope(wabaId);
  if (!waba) return { ok: false as const, synced: 0, missing: 0, error: "WABA not found" };

  const client = await clientForWaba(waba);
  if (!client) {
    return {
      ok: false as const,
      synced: 0,
      missing: 0,
      error: "No Meta credential resolved for this WABA",
    };
  }

  let result = await collectFlows(client, waba.meta_waba_id);
  // If Meta rejects an optional detail field, never lose the core inventory.
  if (!result.ok) {
    const fallback = await client.request<MetaFlowPage>(`${waba.meta_waba_id}/flows`, {
      query: { limit: "100", fields: "id,name,status,categories,validation_errors" },
    });
    if (!fallback.ok) return { ok: false as const, synced: 0, missing: 0, error: result.error };
    result = { ok: true as const, flows: fallback.data?.data ?? [] };
  }

  const db = supabaseAdmin as any;
  const now = new Date().toISOString();
  const seenIds = new Set(result.flows.map((flow) => flow.id));

  if (result.flows.length > 0) {
    const { error } = await db
      .from("whatsapp_flows")
      .upsert(result.flows.map((flow) => flowRow(waba, flow, now)), {
        onConflict: "waba_id,meta_flow_id",
      });
    if (error) return { ok: false as const, synced: 0, missing: 0, error: error.message };
  }

  const { data: locals, error: localError } = await db
    .from("whatsapp_flows")
    .select("id,meta_flow_id,status")
    .eq("waba_id", waba.id);
  if (localError) {
    return { ok: false as const, synced: result.flows.length, missing: 0, error: localError.message };
  }

  let missing = 0;
  for (const local of locals ?? []) {
    if (!seenIds.has(local.meta_flow_id) && local.status !== "MISSING_FROM_META") {
      const { error } = await db
        .from("whatsapp_flows")
        .update({ status: "MISSING_FROM_META", last_synced_at: now, updated_at: now })
        .eq("id", local.id);
      if (!error) missing += 1;
    }
  }

  return { ok: true as const, synced: result.flows.length, missing };
}

async function loadStoredFlow(flowId: string): Promise<StoredFlow | null> {
  const db = supabaseAdmin as any;
  const { data } = await db
    .from("whatsapp_flows")
    .select("id,waba_id,meta_flow_id,status")
    .eq("id", flowId)
    .maybeSingle();
  return data ?? null;
}

export async function createWhatsappFlow(input: {
  wabaId: string;
  name: string;
  categories: string[];
  endpointUri?: string | null;
  cloneFlowId?: string | null;
}) {
  const waba = await loadWabaScope(input.wabaId);
  if (!waba) return { ok: false as const, error: "WABA not found" };
  const client = await clientForWaba(waba);
  if (!client) return { ok: false as const, error: "No Meta credential resolved for this WABA" };

  const body: Record<string, unknown> = {
    name: input.name.trim(),
    categories: input.categories,
  };
  if (input.endpointUri?.trim()) body["endpoint_uri"] = input.endpointUri.trim();
  if (input.cloneFlowId?.trim()) body["clone_flow_id"] = input.cloneFlowId.trim();

  const response = await client.request<{ id?: string }>(`${waba.meta_waba_id}/flows`, {
    method: "POST",
    body,
  });
  if (!response.ok || !response.data?.id) {
    return { ok: false as const, error: response.errorMessage ?? "Meta did not return a Flow ID" };
  }

  const sync = await syncWabaFlows(waba.id);
  if (!sync.ok) {
    return { ok: true as const, metaFlowId: response.data.id, warning: sync.error };
  }
  const db = supabaseAdmin as any;
  const { data: local } = await db
    .from("whatsapp_flows")
    .select("id")
    .eq("waba_id", waba.id)
    .eq("meta_flow_id", response.data.id)
    .maybeSingle();
  return { ok: true as const, metaFlowId: response.data.id, flowId: local?.id ?? null };
}

export async function updateWhatsappFlowMetadata(input: {
  flowId: string;
  name: string;
  categories: string[];
  endpointUri?: string | null;
}) {
  const flow = await loadStoredFlow(input.flowId);
  if (!flow) return { ok: false as const, error: "Flow not found" };
  if (String(flow.status).toUpperCase() !== "DRAFT") {
    return { ok: false as const, error: "Only DRAFT flows can be edited" };
  }
  const waba = await loadWabaScope(flow.waba_id);
  if (!waba) return { ok: false as const, error: "WABA not found" };
  const client = await clientForWaba(waba);
  if (!client) return { ok: false as const, error: "No Meta credential resolved for this WABA" };

  const body: Record<string, unknown> = {
    name: input.name.trim(),
    categories: input.categories,
  };
  if (input.endpointUri?.trim()) body["endpoint_uri"] = input.endpointUri.trim();

  const response = await client.request<{ success?: boolean }>(flow.meta_flow_id, {
    method: "POST",
    body,
  });
  if (!response.ok) return { ok: false as const, error: response.errorMessage ?? "Graph error" };
  const sync = await syncWabaFlows(waba.id);
  return sync.ok ? { ok: true as const } : { ok: true as const, warning: sync.error };
}

export async function uploadWhatsappFlowJson(input: { flowId: string; flowJson: string }) {
  const flow = await loadStoredFlow(input.flowId);
  if (!flow) return { ok: false as const, error: "Flow not found" };
  if (String(flow.status).toUpperCase() !== "DRAFT") {
    return { ok: false as const, error: "Flow JSON can only be uploaded to a DRAFT flow" };
  }

  try {
    const parsed = JSON.parse(input.flowJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false as const, error: "Flow JSON root must be an object" };
    }
  } catch {
    return { ok: false as const, error: "Flow JSON is not valid JSON" };
  }

  const waba = await loadWabaScope(flow.waba_id);
  if (!waba) return { ok: false as const, error: "WABA not found" };
  const client = await clientForWaba(waba);
  if (!client) return { ok: false as const, error: "No Meta credential resolved for this WABA" };

  const form = new FormData();
  form.append("file", new Blob([input.flowJson], { type: "application/json" }), "flow.json");
  form.append("name", "flow.json");
  form.append("asset_type", "FLOW_JSON");

  const response = await client.requestFormData<{
    success?: boolean;
    validation_errors?: unknown[];
  }>(`${flow.meta_flow_id}/assets`, form, { method: "POST" });
  if (!response.ok) return { ok: false as const, error: response.errorMessage ?? "Graph error" };

  const validationErrors = response.data?.validation_errors ?? [];
  const db = supabaseAdmin as any;
  await db
    .from("whatsapp_flows")
    .update({
      validation_errors: validationErrors,
      metadata: { source: "meta_graph_v26", flow_json_uploaded_at: new Date().toISOString() },
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", flow.id);
  const sync = await syncWabaFlows(waba.id);
  return {
    ok: true as const,
    validationErrors,
    warning: sync.ok ? undefined : sync.error,
  };
}

async function mutateFlow(flowId: string, action: "publish" | "deprecate") {
  const flow = await loadStoredFlow(flowId);
  if (!flow) return { ok: false as const, error: "Flow not found" };

  const waba = await loadWabaScope(flow.waba_id);
  if (!waba) return { ok: false as const, error: "WABA not found" };
  const client = await clientForWaba(waba);
  if (!client) return { ok: false as const, error: "No Meta credential resolved for this WABA" };

  const response = await client.request<{ success?: boolean }>(`${flow.meta_flow_id}/${action}`, {
    method: "POST",
  });
  if (!response.ok) return { ok: false as const, error: response.errorMessage ?? "Graph error" };

  const sync = await syncWabaFlows(waba.id);
  return sync.ok ? { ok: true as const } : { ok: true as const, warning: sync.error };
}

export function publishWhatsappFlow(flowId: string) {
  return mutateFlow(flowId, "publish");
}

export function deprecateWhatsappFlow(flowId: string) {
  return mutateFlow(flowId, "deprecate");
}

export async function deleteDraftWhatsappFlow(flowId: string) {
  const flow = await loadStoredFlow(flowId);
  if (!flow) return { ok: false as const, error: "Flow not found" };
  if (String(flow.status).toUpperCase() !== "DRAFT") {
    return { ok: false as const, error: "Only DRAFT flows can be deleted" };
  }

  const waba = await loadWabaScope(flow.waba_id);
  if (!waba) return { ok: false as const, error: "WABA not found" };
  const client = await clientForWaba(waba);
  if (!client) return { ok: false as const, error: "No Meta credential resolved for this WABA" };

  const response = await client.request<{ success?: boolean }>(flow.meta_flow_id, { method: "DELETE" });
  if (!response.ok) return { ok: false as const, error: response.errorMessage ?? "Graph error" };

  const db = supabaseAdmin as any;
  await db
    .from("whatsapp_flows")
    .update({ status: "DELETED", last_synced_at: new Date().toISOString() })
    .eq("id", flow.id);
  return { ok: true as const };
}
