import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// NOTE: these three RPCs (backend_create_automation_rule, backend_set_automation_rule_enabled,
// backend_delete_automation_rule) are defined in
// supabase/migrations/20260903150000_automation_engine.sql. They will not appear in the
// `.rpc()` name union in src/integrations/supabase/types.ts (and these calls will show as
// type errors) until that file is regenerated against the live schema, e.g.
// `supabase gen types typescript --linked > src/integrations/supabase/types.ts`
// after applying the migration. The casts below are a deliberate, temporary bridge for that
// gap -- remove them once types.ts is regenerated and these three names appear naturally.
type PendingRpcName =
  | "backend_create_automation_rule"
  | "backend_set_automation_rule_enabled"
  | "backend_delete_automation_rule";
type SupabaseRpc = (
  fn: PendingRpcName,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

import type { ActionDef, Condition, TriggerType } from "./types";

export type CreateAutomationRuleInput = {
  organizationId: string;
  name: string;
  description?: string;
  triggerType: TriggerType;
  conditions: Condition[];
  actions: ActionDef[];
  priority?: number;
  isEnabled?: boolean;
  scopeWhatsappNumberId?: string | null;
};

export const createAutomationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreateAutomationRuleInput) => input)
  .handler(async ({ data, context }) => {
    if (!data.name.trim()) throw new Error("Rule name is required");
    if (data.actions.length === 0) throw new Error("At least one action is required");

    const { data: ruleId, error } = await (context.supabase.rpc as unknown as SupabaseRpc)(
      "backend_create_automation_rule",
      {
        p_organization_id: data.organizationId,
        p_name: data.name.trim(),
        p_description: data.description ?? null,
        p_trigger_type: data.triggerType,
        p_trigger_config: {},
        p_conditions: data.conditions,
        p_actions: data.actions,
        p_scope_business_portfolio_id: null,
        p_scope_waba_id: null,
        p_scope_whatsapp_number_id: data.scopeWhatsappNumberId ?? null,
        p_priority: data.priority ?? 100,
        p_is_enabled: data.isEnabled ?? true,
      },
    );
    if (error) throw new Error(error.message);
    return { ruleId: ruleId as string };
  });

export const setAutomationRuleEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { ruleId: string; isEnabled: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.rpc as unknown as SupabaseRpc)(
      "backend_set_automation_rule_enabled",
      { p_rule_id: data.ruleId, p_is_enabled: data.isEnabled },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAutomationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { ruleId: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.rpc as unknown as SupabaseRpc)(
      "backend_delete_automation_rule",
      { p_rule_id: data.ruleId },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
