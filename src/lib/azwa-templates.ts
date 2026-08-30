import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TemplateStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "paused"
  | "disabled"
  | "deleted"
  | "unknown";

export type TemplateButton = {
  type?: string;
  text?: string;
  url?: string;
  phone_number?: string;
};

export type TemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  buttons?: TemplateButton[];
  example?: Record<string, unknown>;
};

export type Template = {
  id: string;
  waba_id: string;
  meta_template_id: string | null;
  name: string;
  category: string;
  language: string;
  status: TemplateStatus;
  quality_rating: string | null;
  rejection_reason: string | null;
  components: TemplateComponent[];
  last_synced_at: string | null;
  updated_at: string | null;
};

const TEMPLATE_STATUSES = new Set<TemplateStatus>([
  "draft",
  "pending",
  "approved",
  "rejected",
  "paused",
  "disabled",
  "deleted",
  "unknown",
]);

function normalizeTemplateStatus(value: string | null | undefined): TemplateStatus {
  const normalized = (value ?? "unknown").toLowerCase() as TemplateStatus;
  return TEMPLATE_STATUSES.has(normalized) ? normalized : "unknown";
}

export function componentOf(
  components: TemplateComponent[],
  type: string,
): TemplateComponent | undefined {
  return components.find(
    (component) => (component.type ?? "").toUpperCase() === type.toUpperCase(),
  );
}

export function bodyText(components: TemplateComponent[]): string {
  return componentOf(components, "BODY")?.text ?? "";
}

export function headerText(components: TemplateComponent[]): string {
  return componentOf(components, "HEADER")?.text ?? "";
}

export function footerText(components: TemplateComponent[]): string {
  return componentOf(components, "FOOTER")?.text ?? "";
}

export function buttonsOf(components: TemplateComponent[]): TemplateButton[] {
  return componentOf(components, "BUTTONS")?.buttons ?? [];
}

/** Placeholders used anywhere in the template, e.g. {{1}} or {{name}}. */
export function placeholdersOf(components: TemplateComponent[]): string[] {
  const text = components.map((component) => component.text ?? "").join(" ");
  const placeholders = [...text.matchAll(/\{\{\s*([\w\d_]+)\s*\}\}/g)].map(
    (match) => match[1] as string,
  );
  return [...new Set(placeholders)];
}

export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: async (): Promise<Template[]> => {
      const { data, error } = await supabase
        .from("templates")
        .select(
          "id, waba_id, meta_template_id, name, category, language, status, quality_rating, rejection_reason, components, last_synced_at, updated_at",
        )
        .order("name");

      if (error) throw error;

      return (data ?? []).map((template) => ({
        id: template.id,
        waba_id: template.waba_id,
        meta_template_id: template.meta_template_id ?? null,
        name: template.name,
        category: (template.category ?? "UTILITY").toUpperCase(),
        language: template.language ?? "ar",
        status: normalizeTemplateStatus(template.status),
        quality_rating: template.quality_rating ?? null,
        rejection_reason: template.rejection_reason ?? null,
        components: (Array.isArray(template.components) ? template.components : []) as TemplateComponent[],
        last_synced_at: template.last_synced_at ?? null,
        updated_at: template.updated_at ?? null,
      }));
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
