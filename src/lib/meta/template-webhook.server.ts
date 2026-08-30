/**
 * Realtime Meta message-template webhook handling.
 * Keeps local template status/category/quality aligned without waiting for a manual sync.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeStatus, syncWabaTemplates } from "./templates.server";

type TemplateWebhookValue = Record<string, unknown> & {
  event?: string;
  status?: string;
  message_template_id?: string | number;
  message_template_name?: string;
  message_template_language?: string;
  reason?: string;
  rejection_reason?: string;
  quality_score?: string;
  new_category?: string;
  category?: string;
};

const TEMPLATE_FIELDS = new Set([
  "message_template_status_update",
  "message_template_quality_update",
  "template_category_update",
]);

function stringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function qualityFromValue(value: TemplateWebhookValue): string | null {
  const direct = stringValue(value.quality_score);
  if (direct) return direct.toUpperCase();
  const event = stringValue(value.event)?.toUpperCase() ?? null;
  if (event && ["GREEN", "YELLOW", "RED", "HIGH", "MEDIUM", "LOW"].includes(event)) return event;
  return null;
}

export function isTemplateWebhookField(field: string | null | undefined) {
  return Boolean(field && TEMPLATE_FIELDS.has(field));
}

async function findLocalTemplate(input: {
  organizationId: string;
  metaWabaId: string;
  value: TemplateWebhookValue;
}) {
  const { data: waba } = await supabaseAdmin
    .from("wabas")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("meta_waba_id", input.metaWabaId)
    .maybeSingle();
  if (!waba) return { wabaId: null as string | null, template: null };

  const metaTemplateId = stringValue(input.value.message_template_id);
  const name = stringValue(input.value.message_template_name);
  const language = stringValue(input.value.message_template_language);

  let query = supabaseAdmin
    .from("templates")
    .select("id, status, category, quality_rating")
    .eq("waba_id", waba.id);

  if (metaTemplateId) query = query.eq("meta_template_id", metaTemplateId);
  else if (name) {
    query = query.eq("name", name);
    if (language) query = query.eq("language", language);
  } else {
    return { wabaId: waba.id, template: null };
  }

  const { data: template } = await query.limit(1).maybeSingle();
  return { wabaId: waba.id, template };
}

export async function applyTemplateWebhookChange(input: {
  organizationId: string;
  metaWabaId: string | null;
  field: string | null | undefined;
  value: unknown;
}) {
  if (!input.metaWabaId || !isTemplateWebhookField(input.field)) {
    return { handled: false as const };
  }

  const value = (input.value ?? {}) as TemplateWebhookValue;
  let local = await findLocalTemplate({
    organizationId: input.organizationId,
    metaWabaId: input.metaWabaId,
    value,
  });

  // Template may have been created directly in Meta. Pull the WABA library once
  // and retry so the webhook can still converge local state immediately.
  if (local.wabaId && !local.template) {
    await syncWabaTemplates(local.wabaId);
    local = await findLocalTemplate({
      organizationId: input.organizationId,
      metaWabaId: input.metaWabaId,
      value,
    });
  }

  if (!local.wabaId || !local.template) {
    return {
      handled: true as const,
      updated: false,
      error: "Template webhook received but local WABA/template mapping was not found",
    };
  }

  const patch: Record<string, unknown> = {
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (input.field === "message_template_status_update") {
    patch["status"] = normalizeStatus(stringValue(value.event) ?? stringValue(value.status));
    patch["rejection_reason"] =
      stringValue(value.reason) ?? stringValue(value.rejection_reason) ?? null;
  }

  if (input.field === "message_template_quality_update") {
    patch["quality_rating"] = qualityFromValue(value);
  }

  if (input.field === "template_category_update") {
    const category = stringValue(value.new_category) ?? stringValue(value.category) ?? stringValue(value.event);
    if (category) patch["category"] = category.toUpperCase();
  }

  const { error } = await supabaseAdmin
    .from("templates")
    // Runtime schema is ahead of generated types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("id", local.template.id);

  if (error) {
    return { handled: true as const, updated: false, error: error.message };
  }

  return { handled: true as const, updated: true, templateId: local.template.id };
}
