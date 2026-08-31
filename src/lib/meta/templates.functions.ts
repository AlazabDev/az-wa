import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  wabaId: string,
  permission = TEMPLATE_MANAGE_PERMISSION,
): Promise<string> {
  if (!wabaId) throw new Error("A WABA is required");

  const { data: waba, error } = await supabase
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

export const syncTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { wabaId: string }) => {
    if (!input?.wabaId) throw new Error("A WABA is required");
    return { wabaId: input.wabaId };
  })
  .handler(async ({ data, context }) => {
    await assertWabaPermission(context.supabase, data.wabaId);

    // Keep server-only modules out of the browser bundle.
    const { syncWabaTemplates } = await import("./templates.server");
    return syncWabaTemplates(data.wabaId);
  });

export const createTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CreateTemplateInput) => {
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

    const hasBody = input.components.some(
      (component) => String(component["type"] ?? "").toUpperCase() === "BODY",
    );
    if (!hasBody) throw new Error("A BODY component is required");

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
  .inputValidator((input: { templateId: string }) => {
    if (!input?.templateId) throw new Error("A template is required");
    return { templateId: input.templateId };
  })
  .handler(async ({ data, context }) => {
    const { data: template, error } = await context.supabase
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
