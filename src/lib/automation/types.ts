/**
 * Automation Engine — shared types.
 *
 * These mirror the JSONB shapes stored in `automation_rules.trigger_config`,
 * `automation_rules.conditions` and `automation_rules.actions`. Keeping the
 * shapes centrally typed here means the rule-creation UI, the evaluator and
 * the action executors can never silently drift apart.
 */

export const TRIGGER_TYPES = [
  "message_received",
  "keyword_received",
  "media_received",
  "new_contact",
  "message_delivered",
  "message_read",
  "message_failed",
] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export type Condition =
  | { type: "message_type"; value: string }
  | {
      type: "keyword";
      keywords: string[];
      matchMode?: "contains" | "exact";
      caseSensitive?: boolean;
    }
  | { type: "contact_tag"; tagName: string }
  | {
      type: "contact_field";
      field: string;
      operator: "eq" | "neq" | "exists" | "not_exists";
      value?: string;
    }
  | { type: "time_window"; days: number[]; startHour: number; endHour: number };

export type ActionDef =
  | { type: "send_message"; body: string }
  | { type: "send_template"; templateId: string; bodyParameters?: string[] }
  | { type: "add_tag"; tagName: string }
  | { type: "remove_tag"; tagName: string }
  | { type: "update_contact"; customFields: Record<string, string> }
  | { type: "assign_agent"; userId: string }
  | { type: "call_webhook"; outgoingWebhookId: string };

/** Everything an evaluator/action executor needs about the triggering event. */
export type AutomationTriggerContext = {
  organizationId: string;
  triggerType: TriggerType;
  whatsappNumberId: string;
  wabaId: string;
  businessPortfolioId: string | null;
  contactId: string | null;
  conversationId: string | null;
  messageId: string | null;
  /** Raw inbound message body (text) when applicable, for keyword matching. */
  messageBody: string | null;
  messageType: string | null;
};
