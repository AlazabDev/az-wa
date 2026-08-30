import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TemplateComponentInput = Record<string, unknown>;

export type CreateTemplateInput = {
  wabaId: string;
  name: string;
  category: string;
  language: string;
  components: TemplateComponentInput[];
};

async function assertWabaPermission(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  wabaId: string,
  permission: string,
): Promise<string> {
  const { data: waba, error } = await supabase
    .from("wabas")
    .select("id, organization_id")
    .eq("id", wabaId)
    .maybeSingle();
  if (error || !waba) throw new Error("WABA not found or not accessible");

  const { data: allowed, error: permissionError } = await supabase.rpc("azwa_has_org_permission", {
    p_org_id: waba.organization_id,
    p_permission: permission,
  });
  if (permissionError || !allowed) throw new Error("Forbidden");
  return waba.organization_id;
}

export const syncTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { wabaId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertWabaPermission(context.supabase, data.wabaId, "templates.manage");
    const { syncWabaTemplates } = await import("./templates.server");
    return syncWabaTemplates(data.wabaId);
  });

export const createTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CreateTemplateInput) => {
    const name = input.name.trim().toLowerCase().replace(/\s+/g, "_");
    if (!/^[a-z0-9_]{1,512}$/.test(name)) {
      throw new Error("Template name may only contain lowercase letters, numbers and underscores");
    }
    if (!input.wabaId) throw new Error("A WABA is required");
    if (!input.components.length) throw new Error("At least a BODY component is required");
    return { ...input, name };
  })
  .handler(async ({ data, context }) => {
    await assertWabaPermission(context.supabase, data.wabaId, "templates.manage");
    const { createWabaTemplate } = await import("./templates.server");
    return createWabaTemplate({
      wabaId: data.wabaId,
      name: data.name,
      category: data.category.toUpperCase(),
      language: data.language,
      components: data.components,
    });
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { templateId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: tpl, error } = await context.supabase
      .from("templates")
      .select("id, waba_id")
      .eq("id", data.templateId)
      .maybeSingle();
    if (error || !tpl) throw new Error("Template not found or not accessible");

    await assertWabaPermission(context.supabase, tpl.waba_id, "templates.manage");
    const { deleteWabaTemplate } = await import("./templates.server");
    return deleteWabaTemplate(data.templateId);
  });
