/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WhatsApp Flows control-plane integration — server only.
 * Flow state is WABA-scoped and reconciled from Meta without deleting history.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MetaGraphClient, resolveCredential } from "./graph.server";
import { loadWabaScope, type WabaScope } from "./templates.server";

export type MetaFlow = {
  id: string;
  name: string;
  status?: string;
  categories?: string[];
  validation_errors?: unknown[];
};

type MetaFlowPage = {
  data?: MetaFlow[];
  paging?: { cursors?: { after?: string }; next?: string };
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
      fields: "id,name,status,categories,validation_errors",
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

export async function syncWabaFlows(wabaId: string) {
  const waba = await loadWabaScope(wabaId);
  if (!waba) return { ok: false as const, synced: 0, missing: 0, error: "WABA not found" };

  const client = await clientForWaba(waba);
  if (!client) {
    return { ok: false as const, synced: 0, missing: 0, error: "No Meta credential resolved for this WABA" };
  }

  const result = await collectFlows(client, waba.meta_waba_id);
  if (!result.ok) return { ok: false as const, synced: 0, missing: 0, error: result.error };

  const db = supabaseAdmin as any;
  const now = new Date().toISOString();
  const seenIds = new Set(result.flows.map((flow) => flow.id));

  if (result.flows.length > 0) {
    const rows = result.flows.map((flow) => ({
      organization_id: waba.organization_id,
      waba_id: waba.id,
      meta_flow_id: flow.id,
      name: flow.name,
      status: String(flow.status ?? "DRAFT").toUpperCase(),
      categories: flow.categories ?? [],
      validation_errors: flow.validation_errors ?? [],
      metadata: { source: "meta_graph_v26" },
      last_synced_at: now,
      updated_at: now,
    }));

    const { error } = await db
      .from("whatsapp_flows")
      .upsert(rows, { onConflict: "waba_id,meta_flow_id" });
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

async function mutateFlow(flowId: string, action: "publish" | "deprecate") {
  const db = supabaseAdmin as any;
  const { data: flow, error } = await db
    .from("whatsapp_flows")
    .select("id,waba_id,meta_flow_id")
    .eq("id", flowId)
    .maybeSingle();
  if (error || !flow) return { ok: false as const, error: "Flow not found" };

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
  const db = supabaseAdmin as any;
  const { data: flow, error } = await db
    .from("whatsapp_flows")
    .select("id,waba_id,meta_flow_id,status")
    .eq("id", flowId)
    .maybeSingle();
  if (error || !flow) return { ok: false as const, error: "Flow not found" };
  if (String(flow.status).toUpperCase() !== "DRAFT") {
    return { ok: false as const, error: "Only DRAFT flows can be deleted" };
  }

  const waba = await loadWabaScope(flow.waba_id);
  if (!waba) return { ok: false as const, error: "WABA not found" };
  const client = await clientForWaba(waba);
  if (!client) return { ok: false as const, error: "No Meta credential resolved for this WABA" };

  const response = await client.request<{ success?: boolean }>(flow.meta_flow_id, { method: "DELETE" });
  if (!response.ok) return { ok: false as const, error: response.errorMessage ?? "Graph error" };

  await db
    .from("whatsapp_flows")
    .update({ status: "DELETED", last_synced_at: new Date().toISOString() })
    .eq("id", flow.id);
  return { ok: true as const };
}
