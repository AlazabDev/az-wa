import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  buttons?: { type?: string; text?: string; url?: string; phone_number?: string }[];
  example?: Record<string, unknown>;
};

export type Template = {
  id: string;
  waba_id: string;
  meta_template_id: string | null;
  name: string;
  category: string;
  language: string;
  status: string;
  quality_rating: string | null;
  rejection_reason: string | null;
  components: TemplateComponent[];
  last_synced_at: string | null;
  updated_at: string | null;
};

export function componentOf(components: TemplateComponent[], type: string) {
  return components.find((c) => (c.type ?? "").toUpperCase() === type.toUpperCase());
}

export function bodyText(components: TemplateComponent[]): string {
  return componentOf(components, "BODY")?.text ?? "";
}

export function buttonsOf(components: TemplateComponent[]) {
  return componentOf(components, "BUTTONS")?.buttons ?? [];
}

/** Placeholders used in a template body, e.g. {{1}} or {{name}}. */
export function placeholdersOf(components: TemplateComponent[]): string[] {
  const text = components.map((c) => c.text ?? "").join(" ");
  return [...new Set([...text.matchAll(/\{\{\s*([\w\d_]+)\s*\}\}/g)].map((m) => m[1] as string))];
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
      return (data ?? []).map((t) => ({
        id: t.id,
        waba_id: t.waba_id,
        meta_template_id: t.meta_template_id ?? null,
        name: t.name,
        category: (t.category ?? "utility").toUpperCase(),
        language: t.language ?? "ar",
        status: (t.status ?? "unknown").toLowerCase(),
        quality_rating: t.quality_rating ?? null,
        rejection_reason: t.rejection_reason ?? null,
        components: (Array.isArray(t.components) ? t.components : []) as TemplateComponent[],
        last_synced_at: t.last_synced_at ?? null,
        updated_at: t.updated_at ?? null,
      }));
    },
    refetchInterval: 60_000,
  });
}
