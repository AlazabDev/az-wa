/**
 * WhatsApp template operations — server only.
 * All Meta Graph calls go through MetaGraphClient so they are logged.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MetaGraphClient, resolveCredential } from "./graph.server";

export type TemplateComponent = Record<string, unknown>;

export type WabaScope = {
  id: string;
  organization_id: string;
  business_portfolio_id: string | null;
  meta_waba_id: string;
};

export async function loadWabaScope(wabaId: string): Promise<WabaScope | null> {
  const { data } = await supabaseAdmin
    .from("wabas")
    .select("id, organization_id, business_portfolio_id, meta_waba_id")
    .eq("id", wabaId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    organization_id: data.organization_id,
    business_portfolio_id: data.business_portfolio_id ?? null,
    meta_waba_id: data.meta_waba_id,
  };
}

async function clientForWaba(waba: WabaScope) {
  const cred = await resolveCredential({
    wabaId: waba.id,
    businessPortfolioId: waba.business_portfolio_id,
  });
  if (!cred.token) return null;
  return new MetaGraphClient(cred.token, {
    organizationId: waba.organization_id,
    wabaId: waba.id,
    businessPortfolioId: waba.business_portfolio_id,
  });
}

type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  category?: string;
  status?: string;
  quality_score?: { score?: string };
  rejected_reason?: string;
  components?: TemplateComponent[];
};

/** Pulls the full template library of a WABA from Meta and upserts it locally. */
export async function syncWabaTemplates(wabaId: string) {
  const waba = await loadWabaScope(wabaId);
  if (!waba) return { ok: false, error: "WABA not found", synced: 0 };

  const client = await clientForWaba(waba);
  if (!client) return { ok: false, error: "No Meta credential resolved for this WABA", synced: 0 };

  const collected: MetaTemplate[] = [];
  let after: string | undefined;

  for (let page = 0; page < 20; page += 1) {
    const query: Record<string, string> = {
      limit: "100",
      fields: "id,name,language,category,status,quality_score,rejected_reason,components",
    };
    if (after) query["after"] = after;

    const res = await client.request<{
      data?: MetaTemplate[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`${waba.meta_waba_id}/message_templates`, { query });

    if (!res.ok) return { ok: false, error: res.errorMessage ?? "Graph error", synced: 0 };
    collected.push(...(res.data?.data ?? []));
    after = res.data?.paging?.next ? res.data?.paging?.cursors?.after : undefined;
    if (!after) break;
  }

  const now = new Date().toISOString();
  const rows = collected.map((t) => ({
    organization_id: waba.organization_id,
    waba_id: waba.id,
    meta_template_id: t.id,
    name: t.name,
    category: (t.category ?? "UTILITY").toUpperCase(),
    language: t.language,
    status: (t.status ?? "PENDING").toUpperCase(),
    quality_rating: t.quality_score?.score ?? null,
    components: (t.components ?? []) as unknown as Record<string, unknown>[],
    rejection_reason: t.rejected_reason ?? null,
    last_synced_at: now,
    updated_at: now,
  }));

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from("templates")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(rows as any, { onConflict: "waba_id,name,language" });
    if (error) return { ok: false, error: error.message, synced: 0 };
  }

  await supabaseAdmin.from("wabas").update({ last_synced_at: now }).eq("id", waba.id);
  return { ok: true, synced: rows.length };
}

/** Submits a new template to Meta for review and stores the local record. */
export async function createWabaTemplate(input: {
  wabaId: string;
  name: string;
  category: string;
  language: string;
  components: TemplateComponent[];
  allowCategoryChange?: boolean;
}) {
  const waba = await loadWabaScope(input.wabaId);
  if (!waba) return { ok: false, error: "WABA not found" };

  const client = await clientForWaba(waba);
  if (!client) return { ok: false, error: "No Meta credential resolved for this WABA" };

  const res = await client.request<{ id: string; status?: string; category?: string }>(
    `${waba.meta_waba_id}/message_templates`,
    {
      method: "POST",
      body: {
        name: input.name,
        category: input.category,
        language: input.language,
        components: input.components,
        allow_category_change: input.allowCategoryChange ?? true,
      },
    },
  );

  if (!res.ok || !res.data) return { ok: false, error: res.errorMessage ?? "Graph error" };

  const now = new Date().toISOString();
  const { data: row, error } = await supabaseAdmin
    .from("templates")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(
      {
        organization_id: waba.organization_id,
        waba_id: waba.id,
        meta_template_id: res.data.id,
        name: input.name,
        category: (res.data.category ?? input.category).toUpperCase(),
        language: input.language,
        status: (res.data.status ?? "PENDING").toUpperCase(),
        components: input.components as unknown as Record<string, unknown>[],
        last_synced_at: now,
        updated_at: now,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      { onConflict: "waba_id,name,language" },
    )
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await supabaseAdmin.from("template_versions").insert({
    organization_id: waba.organization_id,
    template_id: row.id,
    version_no: 1,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    snapshot: { components: input.components, category: input.category } as any,
  });

  return { ok: true, templateId: row.id, metaTemplateId: res.data.id };
}

/** Deletes a template on Meta and marks the local record as deleted. */
export async function deleteWabaTemplate(templateId: string) {
  const { data: tpl } = await supabaseAdmin
    .from("templates")
    .select("id, waba_id, name, meta_template_id")
    .eq("id", templateId)
    .maybeSingle();
  if (!tpl) return { ok: false, error: "Template not found" };

  const waba = await loadWabaScope(tpl.waba_id);
  if (!waba) return { ok: false, error: "WABA not found" };
  const client = await clientForWaba(waba);
  if (!client) return { ok: false, error: "No Meta credential resolved for this WABA" };

  const query: Record<string, string> = { name: tpl.name };
  if (tpl.meta_template_id) query["hsm_id"] = tpl.meta_template_id;

  const res = await client.request<{ success?: boolean }>(
    `${waba.meta_waba_id}/message_templates`,
    { method: "DELETE", query },
  );
  if (!res.ok) return { ok: false, error: res.errorMessage ?? "Graph error" };

  await supabaseAdmin
    .from("templates")
    .update({ status: "DELETED", updated_at: new Date().toISOString() })
    .eq("id", templateId);

  return { ok: true };
}
