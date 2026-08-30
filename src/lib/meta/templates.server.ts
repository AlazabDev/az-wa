/**
 * WhatsApp template operations — server only.
 * All Meta Graph calls go through MetaGraphClient so they are logged.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MetaGraphClient, resolveCredential } from "./graph.server";

export type TemplateComponent = Record<string, unknown>;

export const LOCAL_TEMPLATE_STATUSES = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "paused",
  "disabled",
  "deleted",
  "unknown",
] as const;

export type LocalTemplateStatus = (typeof LOCAL_TEMPLATE_STATUSES)[number];

/** Meta returns SCREAMING_CASE statuses; the DB check constraint is lowercase. */
export function normalizeStatus(status: string | undefined | null): LocalTemplateStatus {
  const normalized = (status ?? "").trim().toLowerCase();

  if ((LOCAL_TEMPLATE_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as LocalTemplateStatus;
  }

  switch (normalized) {
    case "pending_deletion":
      return "deleted";
    case "in_appeal":
      return "pending";
    case "flagged":
      return "paused";
    default:
      return "unknown";
  }
}

export type WabaScope = {
  id: string;
  organization_id: string;
  business_portfolio_id: string | null;
  meta_waba_id: string;
};

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

type MetaTemplatePage = {
  data?: MetaTemplate[];
  paging?: {
    cursors?: { after?: string };
    next?: string;
  };
};

export async function loadWabaScope(wabaId: string): Promise<WabaScope | null> {
  const { data, error } = await supabaseAdmin
    .from("wabas")
    .select("id, organization_id, business_portfolio_id, meta_waba_id")
    .eq("id", wabaId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    organization_id: data.organization_id,
    business_portfolio_id: data.business_portfolio_id ?? null,
    meta_waba_id: data.meta_waba_id,
  };
}

async function clientForWaba(waba: WabaScope): Promise<MetaGraphClient | null> {
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

/** Pull the complete template library for one WABA from Meta and upsert it locally. */
export async function syncWabaTemplates(wabaId: string) {
  const waba = await loadWabaScope(wabaId);
  if (!waba) return { ok: false as const, error: "WABA not found", synced: 0 };

  const client = await clientForWaba(waba);
  if (!client) {
    return {
      ok: false as const,
      error: "No Meta credential resolved for this WABA",
      synced: 0,
    };
  }

  const collected: MetaTemplate[] = [];
  const seenCursors = new Set<string>();
  let after: string | undefined;

  // Meta currently returns cursor-paginated pages. Keep a safety cap to avoid
  // an accidental infinite loop if Meta repeats a cursor.
  for (let page = 0; page < 100; page += 1) {
    const query: Record<string, string> = {
      limit: "100",
      fields: "id,name,language,category,status,quality_score,rejected_reason,components",
    };
    if (after) query["after"] = after;

    const response = await client.request<MetaTemplatePage>(
      `${waba.meta_waba_id}/message_templates`,
      { query },
    );

    if (!response.ok) {
      return {
        ok: false as const,
        error: response.errorMessage ?? "Graph error",
        synced: 0,
      };
    }

    collected.push(...(response.data?.data ?? []));

    const nextCursor = response.data?.paging?.next
      ? response.data.paging.cursors?.after
      : undefined;

    if (!nextCursor || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    after = nextCursor;
  }

  const now = new Date().toISOString();
  const rows = collected.map((template) => ({
    organization_id: waba.organization_id,
    waba_id: waba.id,
    meta_template_id: template.id,
    name: template.name,
    category: (template.category ?? "UTILITY").toUpperCase(),
    language: template.language,
    status: normalizeStatus(template.status),
    quality_rating: template.quality_score?.score ?? null,
    components: (template.components ?? []) as unknown as Record<string, unknown>[],
    rejection_reason: template.rejected_reason ?? null,
    last_synced_at: now,
    updated_at: now,
  }));

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from("templates")
      // Runtime schema is ahead of the generated client types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(rows as any, { onConflict: "waba_id,name,language" });

    if (error) {
      return { ok: false as const, error: error.message, synced: 0 };
    }
  }

  const { error: wabaUpdateError } = await supabaseAdmin
    .from("wabas")
    .update({ last_synced_at: now })
    .eq("id", waba.id);

  if (wabaUpdateError) {
    return { ok: false as const, error: wabaUpdateError.message, synced: rows.length };
  }

  return { ok: true as const, synced: rows.length };
}

/** Submit a new template to Meta for review and persist the returned Meta identity locally. */
export async function createWabaTemplate(input: {
  wabaId: string;
  name: string;
  category: string;
  language: string;
  components: TemplateComponent[];
  allowCategoryChange?: boolean;
}) {
  const waba = await loadWabaScope(input.wabaId);
  if (!waba) return { ok: false as const, error: "WABA not found" };

  const client = await clientForWaba(waba);
  if (!client) {
    return {
      ok: false as const,
      error: "No Meta credential resolved for this WABA",
    };
  }

  const response = await client.request<{
    id: string;
    status?: string;
    category?: string;
  }>(`${waba.meta_waba_id}/message_templates`, {
    method: "POST",
    body: {
      name: input.name,
      category: input.category.toUpperCase(),
      language: input.language,
      components: input.components,
      allow_category_change: input.allowCategoryChange ?? true,
    },
  });

  if (!response.ok || !response.data) {
    return {
      ok: false as const,
      error: response.errorMessage ?? "Graph error",
    };
  }

  const now = new Date().toISOString();
  const { data: row, error } = await supabaseAdmin
    .from("templates")
    // Runtime schema is ahead of the generated client types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(
      {
        organization_id: waba.organization_id,
        waba_id: waba.id,
        meta_template_id: response.data.id,
        name: input.name,
        category: (response.data.category ?? input.category).toUpperCase(),
        language: input.language,
        status: normalizeStatus(response.data.status ?? "pending"),
        components: input.components as unknown as Record<string, unknown>[],
        last_synced_at: now,
        updated_at: now,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      { onConflict: "waba_id,name,language" },
    )
    .select("id")
    .single();

  if (error || !row) {
    return {
      ok: false as const,
      error: error?.message ?? "Failed to persist the template locally",
    };
  }

  const { error: versionError } = await supabaseAdmin.from("template_versions").insert({
    organization_id: waba.organization_id,
    template_id: row.id,
    version_no: 1,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    snapshot: {
      components: input.components,
      category: (response.data.category ?? input.category).toUpperCase(),
      language: input.language,
    } as any,
  });

  if (versionError) {
    return { ok: false as const, error: versionError.message };
  }

  return {
    ok: true as const,
    templateId: row.id,
    metaTemplateId: response.data.id,
  };
}

/** Delete a template on Meta first, then mark the corresponding local record as deleted. */
export async function deleteWabaTemplate(templateId: string) {
  const { data: template, error: templateError } = await supabaseAdmin
    .from("templates")
    .select("id, waba_id, name, meta_template_id")
    .eq("id", templateId)
    .maybeSingle();

  if (templateError || !template) {
    return { ok: false as const, error: "Template not found" };
  }

  const waba = await loadWabaScope(template.waba_id);
  if (!waba) return { ok: false as const, error: "WABA not found" };

  const client = await clientForWaba(waba);
  if (!client) {
    return {
      ok: false as const,
      error: "No Meta credential resolved for this WABA",
    };
  }

  const query: Record<string, string> = { name: template.name };
  if (template.meta_template_id) query["hsm_id"] = template.meta_template_id;

  const response = await client.request<{ success?: boolean }>(
    `${waba.meta_waba_id}/message_templates`,
    { method: "DELETE", query },
  );

  if (!response.ok) {
    return {
      ok: false as const,
      error: response.errorMessage ?? "Graph error",
    };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("templates")
    .update({ status: "deleted", last_synced_at: now, updated_at: now })
    .eq("id", templateId);

  if (updateError) {
    return { ok: false as const, error: updateError.message };
  }

  return { ok: true as const };
}
