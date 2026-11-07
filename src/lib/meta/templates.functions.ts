import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateTemplateDefinition } from "./template-schema";

export type TemplateComponentInput = Record<string, unknown>;

export type CreateTemplateInput = {
  wabaId: string;
  name: string;
  category: string;
  language: string;
  components: TemplateComponentInput[];
  allowCategoryChange?: boolean;
};

const TEMPLATE_MANAGE_PERMISSION = "templates.manage";
const ALLOWED_CATEGORIES = new Set(["UTILITY", "MARKETING", "AUTHENTICATION"]);

async function assertWabaPermission(
  // Runtime Supabase schema is ahead of generated types.

  supabase: any,
  wabaId: string,
  permission = TEMPLATE_MANAGE_PERMISSION,
): Promise<string> {
  if (!wabaId) throw new Error("A WABA is required");

  const { supabaseRuntimeAdmin } = await import("@/integrations/supabase/client.server");
  const { data: waba, error } = await supabaseRuntimeAdmin
    .from("wabas")
    .select("id, organization_id")
    .eq("id", wabaId)
    .maybeSingle();

  if (error || !waba) {
    throw new Error("WABA not found or not accessible");
  }

  const { data: allowed, error: permissionError } = await supabase.rpc("azwa_has_org_permission", {
    p_org_id: waba.organization_id,
    p_permission: permission,
  });

  if (permissionError) throw new Error(permissionError.message);
  if (!allowed) throw new Error("Forbidden");

  return waba.organization_id;
}

export type TemplateListRow = {
  id: string;
  waba_id: string;
  meta_template_id: string | null;
  name: string;
  category: string;
  language: string;
  status: string;
  quality_rating: string | null;
  rejection_reason: string | null;
  components: unknown;
  last_synced_at: string | null;
  updated_at: string | null;
};

/** Read the clean production backend through an authenticated server boundary. */
export const listTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: Record<string, never>) => input)
  .handler(async ({ context }): Promise<TemplateListRow[]> => {
    const { supabaseRuntimeAdmin } = await import("@/integrations/supabase/client.server");
    const { data: memberships, error: membershipError } = await supabaseRuntimeAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", context.userId)
      .eq("status", "active");
    if (membershipError) throw new Error(membershipError.message);

    const allowedOrgIds: string[] = [];
    for (const orgId of [...new Set((memberships ?? []).map((m) => m.organization_id))]) {
      const { data: allowed, error } = await context.supabase.rpc("azwa_has_org_permission", {
        p_org_id: orgId, p_permission: "templates.read",
      });
      if (error) throw new Error(error.message);
      if (allowed) allowedOrgIds.push(orgId);
    }
    if (!allowedOrgIds.length) return [];

    const rows: TemplateListRow[] = [];
    for (const orgId of allowedOrgIds) {
      for (let offset = 0; offset < 50000; offset += 500) {
        const { data, error } = await supabaseRuntimeAdmin
          .from("templates")
          .select("id, waba_id, meta_template_id, name, category, language, status, quality_rating, rejection_reason, components, last_synced_at, updated_at")
          .eq("organization_id", orgId)
          .order("id")
          .range(offset, offset + 499);
        if (error) throw new Error(error.message);
        rows.push(...((data ?? []) as TemplateListRow[]));
        if ((data ?? []).length < 500) break;
        if (offset === 49500) throw new Error("Template listing exceeded safe pagination limit");
      }
    }
    return rows;
  });

export const syncTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { wabaId: string }) => {
    if (!input?.wabaId) throw new Error("A WABA is required");
    return { wabaId: input.wabaId };
  })
  .handler(async ({ data, context }) => {
    await assertWabaPermission(context.supabase, data.wabaId);

    // Keep server-only modules out of the browser bundle.
    const { syncWabaTemplates } = await import("./templates.server");
    return syncWabaTemplates(data.wabaId);
  });

/**
 * Account-wide sync must be initiated as a single authenticated server action,
 * not a browser loop that stops when one account rejects its token.
 * Each WABA is independently permission-checked; failures are reported.
 */
export const syncAllTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseRuntimeAdmin } = await import("@/integrations/supabase/client.server");
    const { data: memberships, error: membershipError } = await supabaseRuntimeAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", context.userId)
      .eq("status", "active");
    if (membershipError) throw new Error(membershipError.message);
    const orgIds = [...new Set((memberships ?? []).map((m) => m.organization_id))];
    if (!orgIds.length) throw new Error("No authorized organization");

    const { syncWabaTemplates } = await import("./templates.server");
    const results: Array<{ wabaId: string; name: string; ok: boolean; synced: number; error?: string }> = [];

    for (const orgId of orgIds) {
      // Page through the inventory; do not assume there are only seven WABAs.
      let offset = 0;
      for (;;) {
        const { data: wabas, error: listError } = await supabaseRuntimeAdmin
          .from("wabas")
          .select("id, name, meta_waba_id")
          .eq("organization_id", orgId)
          .order("id")
          .range(offset, offset + 199);
        if (listError) throw new Error(listError.message);
        for (const waba of wabas ?? []) {
          const name = waba.name || waba.meta_waba_id || waba.id;
          try {
            await assertWabaPermission(context.supabase, waba.id);
            const result = await syncWabaTemplates(waba.id);
            results.push({
              wabaId: waba.id, name, ok: result.ok, synced: result.synced,
              ...(!result.ok ? { error: result.error } : {}),
            });
          } catch (error) {
            results.push({
              wabaId: waba.id, name, ok: false, synced: 0,
              error: error instanceof Error ? error.message : "WABA sync failed",
            });
          }
        }
        if ((wabas ?? []).length < 200) break;
        offset += 200;
      }
    }
    return {
      ok: results.length > 0 && results.every((result) => result.ok),
      totalWabas: results.length,
      successfulWabas: results.filter((result) => result.ok).length,
      failedWabas: results.filter((result) => !result.ok).length,
      synced: results.reduce((sum, result) => sum + result.synced, 0),
      results,
    };
  });

export const createTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreateTemplateInput) => {
    if (!input?.wabaId) throw new Error("A WABA is required");

    const name = input.name.trim().toLowerCase().replace(/\s+/g, "_");
    if (!/^[a-z0-9_]{1,512}$/.test(name)) {
      throw new Error("Template name may only contain lowercase letters, numbers and underscores");
    }

    const category = input.category.trim().toUpperCase();
    if (!ALLOWED_CATEGORIES.has(category)) {
      throw new Error("Unsupported template category");
    }

    const language = input.language.trim();
    if (!language) throw new Error("Template language is required");

    if (!Array.isArray(input.components) || input.components.length === 0) {
      throw new Error("At least a BODY component is required");
    }

    const validationErrors = validateTemplateDefinition({
      category,
      components: input.components,
    });
    if (validationErrors.length > 0) {
      throw new Error(validationErrors[0] as string);
    }

    return {
      ...input,
      name,
      category,
      language,
      allowCategoryChange: input.allowCategoryChange ?? true,
    };
  })
  .handler(async ({ data, context }) => {
    await assertWabaPermission(context.supabase, data.wabaId);

    // Keep server-only modules out of the browser bundle.
    const { createWabaTemplate } = await import("./templates.server");
    return createWabaTemplate({
      wabaId: data.wabaId,
      name: data.name,
      category: data.category,
      language: data.language,
      components: data.components,
      allowCategoryChange: data.allowCategoryChange,
    });
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { templateId: string }) => {
    if (!input?.templateId) throw new Error("A template is required");
    return { templateId: input.templateId };
  })
  .handler(async ({ data, context }) => {
    const { supabaseRuntimeAdmin } = await import("@/integrations/supabase/client.server");
    const { data: template, error } = await supabaseRuntimeAdmin
      .from("templates")
      .select("id, waba_id")
      .eq("id", data.templateId)
      .maybeSingle();

    if (error || !template) {
      throw new Error("Template not found or not accessible");
    }

    await assertWabaPermission(context.supabase, template.waba_id);

    // Keep server-only modules out of the browser bundle.
    const { deleteWabaTemplate } = await import("./templates.server");
    return deleteWabaTemplate(data.templateId);
  });
