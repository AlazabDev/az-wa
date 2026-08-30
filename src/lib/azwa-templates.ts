import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TemplateStatus =
  "draft" | "pending" | "approved" | "rejected" | "paused" | "disabled" | "deleted" | "unknown";

export type TemplateButton = {
  type?: string;
  text?: string;
  url?: string;
  phone_number?: string;
  example?: string[];
  flow_id?: string;
  flow_action?: string;
  navigate_screen?: string;
  otp_type?: string;
  autofill_text?: string;
  package_name?: string;
  signature_hash?: string;
};

export type TemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  buttons?: TemplateButton[];
  example?: Record<string, unknown>;
  add_security_recommendation?: boolean;
  code_expiration_minutes?: number;
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

export type TemplateRuntimeVariable = {
  id: string;
  label: string;
  name: string;
  componentType: "header" | "body" | "button";
  componentIndex: number;
  buttonIndex?: number;
  buttonSubtype?: "url" | "flow";
  parameterType: "text" | "image" | "video" | "document";
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

function placeholdersInText(text: string | null | undefined): string[] {
  const placeholders = [...(text ?? "").matchAll(/\{\{\s*([\w\d_]+)\s*\}\}/g)].map(
    (match) => match[1] as string,
  );
  return [...new Set(placeholders)];
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

/** Placeholders used in component text and dynamic URL buttons. */
export function placeholdersOf(components: TemplateComponent[]): string[] {
  const placeholders: string[] = [];
  for (const component of components) {
    placeholders.push(...placeholdersInText(component.text));
    for (const button of component.buttons ?? []) {
      if ((button.type ?? "").toUpperCase() === "URL") {
        placeholders.push(...placeholdersInText(button.url));
      }
    }
  }
  return [...new Set(placeholders)];
}

/**
 * Runtime values are component-scoped. Meta does not accept a HEADER variable
 * as a BODY parameter, and URL/Flow buttons have their own runtime components.
 */
export function runtimeVariablesOf(components: TemplateComponent[]): TemplateRuntimeVariable[] {
  const variables: TemplateRuntimeVariable[] = [];

  components.forEach((component, componentIndex) => {
    const type = (component.type ?? "").toUpperCase();
    if (type === "HEADER") {
      const format = (component.format ?? "TEXT").toUpperCase();
      if (["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) {
        variables.push({
          id: `header:${componentIndex}:media`,
          label: `${format} header media (URL or Meta media ID)`,
          name: "media",
          componentType: "header",
          componentIndex,
          parameterType: format.toLowerCase() as "image" | "video" | "document",
        });
      } else if (format === "TEXT") {
        placeholdersInText(component.text).forEach((name, parameterIndex) => {
          variables.push({
            id: `header:${componentIndex}:${parameterIndex}:${name}`,
            label: `HEADER {{${name}}}`,
            name,
            componentType: "header",
            componentIndex,
            parameterType: "text",
          });
        });
      }
    }

    if (type === "BODY") {
      placeholdersInText(component.text).forEach((name, parameterIndex) => {
        variables.push({
          id: `body:${componentIndex}:${parameterIndex}:${name}`,
          label: `BODY {{${name}}}`,
          name,
          componentType: "body",
          componentIndex,
          parameterType: "text",
        });
      });
    }

    if (type === "BUTTONS") {
      (component.buttons ?? []).forEach((button, buttonIndex) => {
        const buttonType = (button.type ?? "").toUpperCase();
        if (buttonType === "URL") {
          placeholdersInText(button.url).forEach((name, parameterIndex) => {
            variables.push({
              id: `button:${componentIndex}:${buttonIndex}:${parameterIndex}:${name}`,
              label: `URL button ${buttonIndex + 1} {{${name}}}`,
              name,
              componentType: "button",
              componentIndex,
              buttonIndex,
              buttonSubtype: "url",
              parameterType: "text",
            });
          });
        }

        if (buttonType === "FLOW") {
          variables.push({
            id: `button:${componentIndex}:${buttonIndex}:flow_token`,
            label: `Flow button ${buttonIndex + 1} token`,
            name: "flow_token",
            componentType: "button",
            componentIndex,
            buttonIndex,
            buttonSubtype: "flow",
            parameterType: "text",
          });
        }
      });
    }
  });

  return variables;
}

function mediaParameter(type: "image" | "video" | "document", value: string) {
  const media = /^https?:\/\//i.test(value) ? { link: value } : { id: value };
  return { type, [type]: media };
}

/** Build the exact Meta runtime component groups from component-scoped input values. */
export function runtimeComponentsFromValues(
  components: TemplateComponent[],
  values: Record<string, string>,
): Record<string, unknown>[] {
  const variables = runtimeVariablesOf(components);
  const runtime: Record<string, unknown>[] = [];

  const headerVariables = variables.filter((variable) => variable.componentType === "header");
  if (headerVariables.length > 0) {
    runtime.push({
      type: "header",
      parameters: headerVariables.map((variable) => {
        const value = (values[variable.id] ?? "").trim();
        return variable.parameterType === "text"
          ? { type: "text", text: value }
          : mediaParameter(variable.parameterType, value);
      }),
    });
  }

  const bodyVariables = variables.filter((variable) => variable.componentType === "body");
  if (bodyVariables.length > 0) {
    runtime.push({
      type: "body",
      parameters: bodyVariables.map((variable) => ({
        type: "text",
        text: (values[variable.id] ?? "").trim(),
      })),
    });
  }

  const buttonIndexes = [
    ...new Set(
      variables
        .filter((variable) => variable.componentType === "button" && variable.buttonIndex != null)
        .map((variable) => variable.buttonIndex as number),
    ),
  ];

  for (const buttonIndex of buttonIndexes) {
    const buttonVariables = variables.filter(
      (variable) => variable.componentType === "button" && variable.buttonIndex === buttonIndex,
    );
    if (buttonVariables.length === 0) continue;

    const buttonSubtype = buttonVariables[0]?.buttonSubtype ?? "url";
    if (buttonSubtype === "flow") {
      const flowToken = (values[buttonVariables[0]?.id ?? ""] ?? "").trim();
      runtime.push({
        type: "button",
        sub_type: "flow",
        index: String(buttonIndex),
        parameters: [
          {
            type: "action",
            action: {
              flow_token: flowToken,
              flow_action_data: {},
            },
          },
        ],
      });
      continue;
    }

    runtime.push({
      type: "button",
      sub_type: buttonSubtype,
      index: String(buttonIndex),
      parameters: buttonVariables.map((variable) => ({
        type: "text",
        text: (values[variable.id] ?? "").trim(),
      })),
    });
  }

  return runtime;
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
        components: (Array.isArray(template.components)
          ? template.components
          : []) as TemplateComponent[],
        last_synced_at: template.last_synced_at ?? null,
        updated_at: template.updated_at ?? null,
      }));
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
