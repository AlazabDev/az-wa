/**
 * WhatsApp template operations — server only.
 * All Meta Graph calls go through MetaGraphClient so they are logged.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MetaGraphClient, resolveCredential } from "./graph.server";
import { MAX_TEMPLATE_PAGES, nextTemplateCursor, validateTemplatePage, type TemplatePage, type MetaTemplateSnapshot } from "./template-sync-pagination";

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

type MetaTemplate = MetaTemplateSnapshot;
type MetaTemplatePage = TemplatePage;

function placeholderIndexes(text: string): number[] {
  return [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value) && value > 0)
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort((a, b) => a - b);
}

/**
 * Meta expects concrete examples for variable placeholders during template review.
 * The UI may omit them, so produce deterministic review-only examples rather than
 * submitting an incomplete component. User-provided examples are always preserved.
 */
export function normalizeComponentsForMeta(components: TemplateComponent[]): TemplateComponent[] {
  return components.map((component) => {
    const type = String(component["type"] ?? "").toUpperCase();
    const normalized: TemplateComponent = { ...component, type };
    const text = typeof component["text"] === "string" ? component["text"] : "";
    const indexes = placeholderIndexes(text);
    const existingExample = component["example"];

    if (indexes.length === 0 || existingExample) return normalized;

    const examples = indexes.map((index) => `sample_${index}`);
    if (type === "BODY") {
      normalized["example"] = { body_text: [examples] };
    } else if (
      type === "HEADER" &&
      String(component["format"] ?? "TEXT").toUpperCase() === "TEXT"
    ) {
      normalized["example"] = { header_text: examples };
    }

    return normalized;
  });
}

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

  try {
    for (let page = 0; page < MAX_TEMPLATE_PAGES; page += 1) {
      const query: Record<string, string> = {
        limit: "100",
        fields: "id,name,language,category,status,quality_score,rejected_reason,components",
      };
      if (after) query["after"] = after;

      const response = await client.request<MetaTemplatePage>(
        `${waba.meta_waba_id}/message_templates`,
        { query },
      );
      if (!response.ok) throw new Error(response.errorMessage ?? "Meta Graph request failed");
      const verified = validateTemplatePage(response.data);
      collected.push(...verified);
      const next = nextTemplateCursor(response.data!, seenCursors);
      if (!next) {
        after = undefined;
        break;
      }
      after = next;
    }
    // Do not publish a partial snapshot as a successful account sync.
    if (after) throw new Error(`Template pagination exceeded ${MAX_TEMPLATE_PAGES} pages`);
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Incomplete Meta template listing",
      synced: 0,
    };
  }

  // Deduplicate by Meta ID so overlapping Graph pages cannot create
  // duplicate rows and abort upsert for a complete listing.
  const unique = [...new Map(collected.map((row) => [row.id, row])).values()];
  const now = new Date().toISOString();
  const rows = unique.map((template) => ({
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

  for (let offset = 0; offset < rows.length; offset += 100) {
    const { error } = await supabaseAdmin
      .from("templates")
      .upsert(rows.slice(offset, offset + 100) as any, { onConflict: "waba_id,name,language" });
    if (error) return { ok: false as const, error: error.message, synced: offset };
  }

  // Reconcile stale Meta templates without removing draft-only local rows.
  // Only update after every Graph page and upsert has succeeded.
  // Limit reconciliation to Meta identities so local drafts remain intact.
  const currentIds = new Set(unique.map((item) => item.id));
  let pageOffset = 0;
  for (;;) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("templates")
      .select("id, meta_template_id, status")
      .eq("waba_id", waba.id)
      .not("meta_template_id", "is", null)
      .order("id")
      .range(pageOffset, pageOffset + 499);
    if (existingError) {
      return { ok: false as const, error: existingError.message, synced: rows.length };
    }
    const staleIds = (existing ?? [])
      .filter((item) => item.meta_template_id && !currentIds.has(item.meta_template_id) && item.status !== "deleted")
      .map((item) => item.id);
    for (let offset = 0; offset < staleIds.length; offset += 100) {
      const { error: staleError } = await supabaseAdmin
        .from("templates")
        .update({ status: "deleted", last_synced_at: now, updated_at: now })
        .eq("waba_id", waba.id)
        .in("id", staleIds.slice(offset, offset + 100));
      if (staleError) return { ok: false as const, error: staleError.message, synced: rows.length };
    }
    if ((existing ?? []).length < 500) break;
    pageOffset += 500;
  }

  const { error: wabaUpdateError } = await supabaseAdmin
    .from("wabas")
    .update({ last_synced_at: now })
    .eq("id", waba.id);

  if (wabaUpdateError) {
    return { ok: false as const, error: wabaUpdateError.message, synced: rows.length };
  }

  return { ok: true as const, synced: rows.length, wabaId: waba.id };
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

  const components = normalizeComponentsForMeta(input.components);
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
      components,
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

    .upsert(
      {
        organization_id: waba.organization_id,
        waba_id: waba.id,
        meta_template_id: response.data.id,
        name: input.name,
        category: (response.data.category ?? input.category).toUpperCase(),
        language: input.language,
        status: normalizeStatus(response.data.status ?? "pending"),
        components: components as unknown as Record<string, unknown>[],
        last_synced_at: now,
        updated_at: now,
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

  const { error: versionError } = await (
    supabaseAdmin as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .from("template_versions")
    .insert({
      organization_id: waba.organization_id,
      template_id: row.id,
      version_no: 1,
      // Runtime schema is ahead of the generated client types.
      snapshot: {
        components,
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
