/**
 * Automation Engine — condition evaluation. Server-only because it reads
 * contact tags/custom_fields via supabaseAdmin, but contains no Meta or
 * network calls itself (pure decision logic against already-fetched data).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import type { AutomationTriggerContext, Condition } from "./types";

async function contactHasTag(contactId: string, tagName: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("contact_tags")
    .select("tag_id, tags!inner(name)")
    .eq("contact_id", contactId)
    .eq("tags.name", tagName)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

async function contactCustomField(contactId: string, field: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("custom_fields")
    .eq("id", contactId)
    .maybeSingle();
  const fields = (data?.custom_fields ?? {}) as Record<string, unknown>;
  const value = fields[field];
  return value === undefined || value === null ? null : String(value);
}

function matchesKeyword(body: string | null, condition: Extract<Condition, { type: "keyword" }>) {
  if (!body) return false;
  const haystack = condition.caseSensitive ? body : body.toLowerCase();
  return condition.keywords.some((raw) => {
    const needle = condition.caseSensitive ? raw : raw.toLowerCase();
    return condition.matchMode === "exact"
      ? haystack.trim() === needle.trim()
      : haystack.includes(needle);
  });
}

function matchesTimeWindow(condition: Extract<Condition, { type: "time_window" }>) {
  const now = new Date();
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (condition.days.length > 0 && !condition.days.includes(day)) return false;
  if (condition.startHour <= condition.endHour) {
    return hour >= condition.startHour && hour < condition.endHour;
  }
  // wraps past midnight, e.g. 22 -> 6
  return hour >= condition.startHour || hour < condition.endHour;
}

/** Evaluates one condition. Every condition in a rule must pass (AND). */
async function evaluateOne(condition: Condition, ctx: AutomationTriggerContext): Promise<boolean> {
  switch (condition.type) {
    case "message_type":
      return ctx.messageType === condition.value;
    case "keyword":
      return matchesKeyword(ctx.messageBody, condition);
    case "contact_tag":
      return ctx.contactId ? contactHasTag(ctx.contactId, condition.tagName) : false;
    case "contact_field": {
      if (!ctx.contactId) return false;
      const value = await contactCustomField(ctx.contactId, condition.field);
      if (condition.operator === "exists") return value !== null;
      if (condition.operator === "not_exists") return value === null;
      if (condition.operator === "eq") return value === (condition.value ?? null);
      if (condition.operator === "neq") return value !== (condition.value ?? null);
      return false;
    }
    case "time_window":
      return matchesTimeWindow(condition);
    default:
      return false;
  }
}

export async function evaluateConditions(
  conditions: Condition[],
  ctx: AutomationTriggerContext,
): Promise<boolean> {
  for (const condition of conditions) {
    const passed = await evaluateOne(condition, ctx);
    if (!passed) return false;
  }
  return true;
}
