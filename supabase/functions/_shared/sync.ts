import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { metaFetch, metaGetAll } from "./meta.ts";
import type { MetaScope } from "./types.ts";

type SyncType = "business" | "wabas" | "numbers" | "templates" | "number_health" | "full";

export async function runMetaSync(
  client: SupabaseClient,
  params: {
    organizationId: string;
    requestedBy?: string | null;
    syncType: SyncType;
    businessPortfolioId?: string | null;
    wabaId?: string | null;
    whatsappNumberId?: string | null;
  },
): Promise<Record<string, unknown>> {
  const { data: run, error: runError } = await client
    .from("meta_sync_runs")
    .insert({
      organization_id: params.organizationId,
      business_portfolio_id: params.businessPortfolioId ?? null,
      waba_id: params.wabaId ?? null,
      whatsapp_number_id: params.whatsappNumberId ?? null,
      sync_type: params.syncType,
      status: "running",
      requested_by: params.requestedBy ?? null,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (runError) throw new Error(`Unable to start sync run: ${runError.message}`);

  const stats: Record<string, unknown> = {};
  try {
    if (params.syncType === "business" || params.syncType === "full") {
      stats.business = await syncBusiness(client, params.organizationId, params.businessPortfolioId ?? undefined);
    }
    if (params.syncType === "wabas" || params.syncType === "full") {
      stats.wabas = await syncWabas(client, params.organizationId, params.businessPortfolioId ?? undefined);
    }
    if (params.syncType === "numbers" || params.syncType === "full") {
      stats.numbers = await syncNumbers(client, params.organizationId, params.wabaId ?? undefined);
    }
    if (params.syncType === "templates" || params.syncType === "full") {
      stats.templates = await syncTemplates(client, params.organizationId, params.wabaId ?? undefined);
    }
    if (params.syncType === "number_health") {
      if (!params.whatsappNumberId) throw new Error("whatsappNumberId is required for number_health sync");
      stats.number_health = await syncNumberHealth(client, params.organizationId, params.whatsappNumberId);
    }

    await client.from("meta_sync_runs").update({
      status: "completed",
      stats,
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    return { sync_run_id: run.id, status: "completed", stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client.from("meta_sync_runs").update({
      status: "failed",
      stats,
      error: message,
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    throw error;
  }
}

export async function syncBusiness(client: SupabaseClient, organizationId: string, businessPortfolioId?: string): Promise<Record<string, unknown>> {
  const query = client.from("business_portfolios").select("*").eq("organization_id", organizationId);
  const { data: businesses, error } = businessPortfolioId ? await query.eq("id", businessPortfolioId) : await query;
  if (error) throw new Error(`Business lookup failed: ${error.message}`);

  let updated = 0;
  for (const business of businesses ?? []) {
    const scope: MetaScope = {
      organizationId,
      businessPortfolioId: business.id,
    };
    const remote: any = await metaFetch(client, scope, business.meta_business_id, {
      query: { fields: "id,name" },
    });
    const { error: updateError } = await client.from("business_portfolios").update({
      name: remote?.name ?? business.name,
      status: "active",
      last_synced_at: new Date().toISOString(),
      metadata: { ...(business.metadata ?? {}), meta_business_snapshot: remote ?? {} },
    }).eq("id", business.id);
    if (updateError) throw new Error(`Business update failed: ${updateError.message}`);
    updated += 1;
  }
  return { checked: businesses?.length ?? 0, updated };
}

export async function syncWabas(client: SupabaseClient, organizationId: string, businessPortfolioId?: string): Promise<Record<string, unknown>> {
  let q = client.from("business_portfolios").select("*").eq("organization_id", organizationId);
  if (businessPortfolioId) q = q.eq("id", businessPortfolioId);
  const { data: businesses, error } = await q;
  if (error) throw new Error(`Business lookup failed: ${error.message}`);

  let discovered = 0;
  let markedMissing = 0;
  for (const business of businesses ?? []) {
    const scope: MetaScope = { organizationId, businessPortfolioId: business.id };
    const remote = await metaGetAll<any>(client, scope, `${business.meta_business_id}/owned_whatsapp_business_accounts`, {
      fields: "id,name,currency,timezone_id",
      limit: 100,
    });
    const remoteIds = new Set(remote.map((x) => String(x.id)));

    for (const w of remote) {
      const { data: upserted, error: upsertError } = await client.from("wabas").upsert({
        organization_id: organizationId,
        business_portfolio_id: business.id,
        meta_waba_id: String(w.id),
        name: w.name ?? null,
        currency: w.currency ?? null,
        timezone: w.timezone_id != null ? String(w.timezone_id) : null,
        status: "active",
        last_synced_at: new Date().toISOString(),
        metadata: { meta_snapshot: w },
      }, { onConflict: "organization_id,meta_waba_id" }).select("id").single();
      if (upsertError) throw new Error(`WABA upsert failed: ${upsertError.message}`);
      discovered += 1;

      const { data: apps } = await client.from("meta_apps").select("id").eq("organization_id", organizationId).eq("business_portfolio_id", business.id).eq("status", "active");
      for (const app of apps ?? []) {
        await client.from("meta_app_wabas").upsert({ meta_app_id: app.id, waba_id: upserted.id, status: "active" }, { onConflict: "meta_app_id,waba_id" });
      }
    }

    const { data: locals } = await client.from("wabas").select("id,meta_waba_id,status").eq("organization_id", organizationId).eq("business_portfolio_id", business.id);
    for (const local of locals ?? []) {
      if (!remoteIds.has(local.meta_waba_id) && local.status !== "archived") {
        await client.from("wabas").update({ status: "missing_from_meta", last_synced_at: new Date().toISOString() }).eq("id", local.id);
        markedMissing += 1;
      }
    }
  }
  return { discovered, marked_missing: markedMissing };
}

export async function syncNumbers(client: SupabaseClient, organizationId: string, wabaId?: string): Promise<Record<string, unknown>> {
  let q = client.from("wabas").select("*, business_portfolios!inner(id)").eq("organization_id", organizationId);
  if (wabaId) q = q.eq("id", wabaId);
  const { data: wabas, error } = await q;
  if (error) throw new Error(`WABA lookup failed: ${error.message}`);

  let discovered = 0;
  let markedMissing = 0;
  for (const waba of wabas ?? []) {
    const scope: MetaScope = {
      organizationId,
      wabaId: waba.id,
      businessPortfolioId: waba.business_portfolio_id,
    };
    const remote = await metaGetAll<any>(client, scope, `${waba.meta_waba_id}/phone_numbers`, {
      fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type",
      limit: 100,
    });
    const remoteIds = new Set(remote.map((x) => String(x.id)));
    for (const n of remote) {
      const display = n.display_phone_number != null ? String(n.display_phone_number) : null;
      const normalized = display ? display.replace(/[^0-9]/g, "") : null;
      const { error: upsertError } = await client.from("whatsapp_numbers").upsert({
        organization_id: organizationId,
        waba_id: waba.id,
        meta_phone_number_id: String(n.id),
        display_phone_number: display,
        normalized_phone_number: normalized,
        verified_name: n.verified_name ?? null,
        code_verification_status: n.code_verification_status ?? null,
        quality_rating: n.quality_rating ?? null,
        platform_type: n.platform_type ?? null,
        status: "active",
        is_enabled: true,
        last_synced_at: new Date().toISOString(),
        metadata: { meta_snapshot: n },
      }, { onConflict: "organization_id,meta_phone_number_id" });
      if (upsertError) throw new Error(`Phone number upsert failed: ${upsertError.message}`);
      discovered += 1;
    }

    const { data: locals } = await client.from("whatsapp_numbers").select("id,meta_phone_number_id,status").eq("organization_id", organizationId).eq("waba_id", waba.id);
    for (const local of locals ?? []) {
      if (!remoteIds.has(local.meta_phone_number_id) && local.status !== "archived") {
        await client.from("whatsapp_numbers").update({
          status: "missing_from_meta",
          last_synced_at: new Date().toISOString(),
        }).eq("id", local.id);
        markedMissing += 1;
      }
    }
  }
  return { discovered, marked_missing: markedMissing };
}

export async function syncTemplates(client: SupabaseClient, organizationId: string, wabaId?: string): Promise<Record<string, unknown>> {
  let q = client.from("wabas").select("*").eq("organization_id", organizationId);
  if (wabaId) q = q.eq("id", wabaId);
  const { data: wabas, error } = await q;
  if (error) throw new Error(`WABA lookup failed: ${error.message}`);

  let discovered = 0;
  let markedMissing = 0;
  for (const waba of wabas ?? []) {
    const scope: MetaScope = { organizationId, wabaId: waba.id, businessPortfolioId: waba.business_portfolio_id };
    const remote = await metaGetAll<any>(client, scope, `${waba.meta_waba_id}/message_templates`, {
      fields: "id,name,status,category,language,quality_score,components",
      limit: 100,
    });
    const remoteKeys = new Set<string>();
    for (const t of remote) {
      const language = String(t.language ?? "en_US");
      const name = String(t.name ?? "");
      remoteKeys.add(`${name}\u0000${language}`);
      const status = normalizeTemplateStatus(t.status);
      const quality = typeof t.quality_score === "object" ? (t.quality_score?.score ?? null) : (t.quality_score ?? null);
      const { error: upsertError } = await client.from("templates").upsert({
        organization_id: organizationId,
        waba_id: waba.id,
        meta_template_id: t.id != null ? String(t.id) : null,
        name,
        category: t.category ?? null,
        language,
        status,
        quality_rating: quality != null ? String(quality) : null,
        components: Array.isArray(t.components) ? t.components : [],
        rejection_reason: t.rejected_reason ?? t.rejection_reason ?? null,
        last_synced_at: new Date().toISOString(),
        metadata: { meta_snapshot: t },
      }, { onConflict: "waba_id,name,language" });
      if (upsertError) throw new Error(`Template upsert failed: ${upsertError.message}`);
      discovered += 1;
    }

    const { data: locals } = await client.from("templates").select("id,name,language,status").eq("waba_id", waba.id);
    for (const local of locals ?? []) {
      if (!remoteKeys.has(`${local.name}\u0000${local.language}`) && !["draft", "deleted"].includes(local.status)) {
        await client.from("templates").update({ status: "deleted", last_synced_at: new Date().toISOString() }).eq("id", local.id);
        markedMissing += 1;
      }
    }
  }
  return { discovered, marked_missing: markedMissing };
}

export async function syncNumberHealth(client: SupabaseClient, organizationId: string, whatsappNumberId: string): Promise<Record<string, unknown>> {
  const { data: number, error } = await client.from("whatsapp_numbers").select("*,wabas!inner(business_portfolio_id)").eq("organization_id", organizationId).eq("id", whatsappNumberId).single();
  if (error || !number) throw new Error("WhatsApp number not found");
  const scope: MetaScope = {
    organizationId,
    whatsappNumberId: number.id,
    wabaId: number.waba_id,
    businessPortfolioId: number.wabas.business_portfolio_id,
  };
  const started = performance.now();
  try {
    const remote: any = await metaFetch(client, scope, number.meta_phone_number_id, {
      query: { fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type" },
    });
    const latency = Math.round(performance.now() - started);
    await client.from("whatsapp_numbers").update({
      display_phone_number: remote.display_phone_number ?? number.display_phone_number,
      normalized_phone_number: (remote.display_phone_number ?? number.display_phone_number ?? "").replace(/[^0-9]/g, "") || null,
      verified_name: remote.verified_name ?? number.verified_name,
      quality_rating: remote.quality_rating ?? number.quality_rating,
      code_verification_status: remote.code_verification_status ?? number.code_verification_status,
      platform_type: remote.platform_type ?? number.platform_type,
      status: "active",
      last_api_success_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      metadata: { ...(number.metadata ?? {}), meta_snapshot: remote },
    }).eq("id", number.id);
    await client.from("health_checks").insert({
      organization_id: organizationId,
      whatsapp_number_id: number.id,
      component: "meta_api",
      status: "healthy",
      score: 100,
      message: "Meta Graph API connection healthy",
      details: { latency_ms: latency, meta: remote },
    });
    return { status: "healthy", latency_ms: latency, meta: remote };
  } catch (error) {
    const latency = Math.round(performance.now() - started);
    const message = error instanceof Error ? error.message : String(error);
    await client.from("whatsapp_numbers").update({ last_api_failure_at: new Date().toISOString() }).eq("id", number.id);
    await client.from("health_checks").insert({
      organization_id: organizationId,
      whatsapp_number_id: number.id,
      component: "meta_api",
      status: "critical",
      score: 0,
      message,
      details: { latency_ms: latency, error: message },
    });
    throw error;
  }
}

function normalizeTemplateStatus(value: unknown): string {
  const s = String(value ?? "unknown").toLowerCase();
  if (["pending", "approved", "rejected", "paused", "disabled", "deleted"].includes(s)) return s;
  return "unknown";
}
