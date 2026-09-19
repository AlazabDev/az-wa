/**
 * Automation Engine — action execution. System-triggered (no authenticated
 * user), so this does NOT reuse azwa_can_send_number (which requires
 * auth.uid()). Instead it checks the number/WABA-level safety invariant
 * directly: the 2026-09-01 sender-safety migration guarantees
 * whatsapp_numbers.is_enabled is only ever true when the number AND its
 * parent WABA are both active, so that single check is sufficient here.
 */
import { supabaseAdmin as typedSupabaseAdmin } from "@/integrations/supabase/client.server";

// Runtime client intentionally follows the live clean schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAdmin = typedSupabaseAdmin as any;

import { clientForNumber } from "../meta/graph.server";
import type { ActionDef, AutomationTriggerContext } from "./types";

export type ActionResult = { type: ActionDef["type"]; ok: boolean; detail?: string };

async function assertNumberDispatchSafe(numberId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("whatsapp_numbers")
    .select("is_enabled, status")
    .eq("id", numberId)
    .maybeSingle();
  if (!data || !data.is_enabled || data.status !== "active") {
    throw new Error("WhatsApp number is not currently safe to send from (disabled or non-active)");
  }
}

async function recipientForConversation(conversationId: string | null): Promise<string | null> {
  if (!conversationId) return null;
  const { data } = await supabaseAdmin
    .from("conversations")
    .select("contact_channels:contact_channel_id(address)")
    .eq("id", conversationId)
    .maybeSingle();
  return data?.contact_channels?.address ?? null;
}

async function sendMessageAction(
  ctx: AutomationTriggerContext,
  action: Extract<ActionDef, { type: "send_message" }>,
): Promise<ActionResult> {
  await assertNumberDispatchSafe(ctx.whatsappNumberId);
  const recipient = await recipientForConversation(ctx.conversationId);
  if (!recipient)
    return { type: action.type, ok: false, detail: "no recipient address on conversation" };

  const { client, number } = await clientForNumber(ctx.whatsappNumberId);
  if (!client || !number)
    return { type: action.type, ok: false, detail: "no active Meta credential for this number" };

  const requestPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient,
    type: "text",
    text: { preview_url: false, body: action.body.slice(0, 4096) },
  };

  const idempotencyKey = `automation:${ctx.messageId ?? crypto.randomUUID()}:${crypto.randomUUID()}`;
  const { data: outbox, error: outboxError } = await supabaseAdmin
    .from("message_outbox")
    .insert({
      organization_id: number.organization_id,
      whatsapp_number_id: ctx.whatsappNumberId,
      contact_id: ctx.contactId,
      conversation_id: ctx.conversationId,
      recipient_address: recipient,
      message_type: "text",
      request_payload: requestPayload,
      idempotency_key: idempotencyKey,
      requested_by: null,
      status: "sending",
      attempt_count: 0,
      next_attempt_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (outboxError || !outbox?.id)
    return { type: action.type, ok: false, detail: outboxError?.message ?? "outbox insert failed" };

  const result = await client.request<{ messages?: Array<{ id?: string }> }>(
    `${number.meta_phone_number_id}/messages`,
    { method: "POST", body: requestPayload },
  );

  if (!result.ok) {
    await supabaseAdmin.rpc("backend_finalize_outbox_failure", {
      p_outbox_id: outbox.id,
      p_error: result.errorMessage ?? `HTTP ${result.status}`,
      p_final: true,
    });
    return { type: action.type, ok: false, detail: result.errorMessage ?? `HTTP ${result.status}` };
  }

  const metaMessageId = result.data?.messages?.[0]?.id ?? null;
  if (!metaMessageId) {
    await supabaseAdmin.rpc("backend_finalize_outbox_failure", {
      p_outbox_id: outbox.id,
      p_error: "Meta accepted the request without returning a message ID",
      p_final: true,
    });
    return { type: action.type, ok: false, detail: "no message id returned" };
  }

  await supabaseAdmin.rpc("backend_finalize_outbox_success", {
    p_outbox_id: outbox.id,
    p_meta_message_id: metaMessageId,
    p_raw_response: result.data ?? {},
  });
  return { type: action.type, ok: true, detail: metaMessageId };
}

async function sendTemplateAction(
  ctx: AutomationTriggerContext,
  action: Extract<ActionDef, { type: "send_template" }>,
): Promise<ActionResult> {
  await assertNumberDispatchSafe(ctx.whatsappNumberId);
  const recipient = await recipientForConversation(ctx.conversationId);
  if (!recipient)
    return { type: action.type, ok: false, detail: "no recipient address on conversation" };

  const { data: template } = await supabaseAdmin
    .from("templates")
    .select("id, waba_id, name, language, status")
    .eq("id", action.templateId)
    .maybeSingle();
  if (!template) return { type: action.type, ok: false, detail: "template not found" };
  if (template.waba_id !== ctx.wabaId)
    return { type: action.type, ok: false, detail: "template belongs to a different WABA" };
  if (String(template.status).toLowerCase() !== "approved")
    return { type: action.type, ok: false, detail: "template is not approved" };

  const { client, number } = await clientForNumber(ctx.whatsappNumberId);
  if (!client || !number)
    return { type: action.type, ok: false, detail: "no active Meta credential for this number" };

  const bodyComponent =
    action.bodyParameters && action.bodyParameters.length > 0
      ? [
          {
            type: "body",
            parameters: action.bodyParameters.map((text) => ({ type: "text", text })),
          },
        ]
      : [];

  const requestPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      ...(bodyComponent.length > 0 ? { components: bodyComponent } : {}),
    },
  };

  const idempotencyKey = `automation-template:${ctx.messageId ?? crypto.randomUUID()}:${crypto.randomUUID()}`;
  const { data: outbox, error: outboxError } = await supabaseAdmin
    .from("message_outbox")
    .insert({
      organization_id: number.organization_id,
      whatsapp_number_id: ctx.whatsappNumberId,
      contact_id: ctx.contactId,
      conversation_id: ctx.conversationId,
      recipient_address: recipient,
      message_type: "template",
      request_payload: requestPayload,
      idempotency_key: idempotencyKey,
      requested_by: null,
      status: "sending",
      attempt_count: 0,
      next_attempt_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (outboxError || !outbox?.id)
    return { type: action.type, ok: false, detail: outboxError?.message ?? "outbox insert failed" };

  const result = await client.request<{ messages?: Array<{ id?: string }> }>(
    `${number.meta_phone_number_id}/messages`,
    { method: "POST", body: requestPayload },
  );

  if (!result.ok || !result.data?.messages?.[0]?.id) {
    await supabaseAdmin.rpc("backend_finalize_outbox_failure", {
      p_outbox_id: outbox.id,
      p_error: result.errorMessage ?? "template send failed",
      p_final: true,
    });
    return { type: action.type, ok: false, detail: result.errorMessage ?? "template send failed" };
  }

  await supabaseAdmin.rpc("backend_finalize_outbox_success", {
    p_outbox_id: outbox.id,
    p_meta_message_id: result.data.messages[0].id,
    p_raw_response: result.data ?? {},
  });
  return { type: action.type, ok: true, detail: result.data.messages[0].id };
}

async function resolveOrCreateTagId(organizationId: string, tagName: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("tags")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", tagName)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabaseAdmin
    .from("tags")
    .insert({ organization_id: organizationId, name: tagName })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "unable to create tag");
  return created.id;
}

async function addTagAction(
  ctx: AutomationTriggerContext,
  action: Extract<ActionDef, { type: "add_tag" }>,
): Promise<ActionResult> {
  if (!ctx.contactId) return { type: action.type, ok: false, detail: "no contact on this trigger" };
  const tagId = await resolveOrCreateTagId(ctx.organizationId, action.tagName);
  const { error } = await supabaseAdmin
    .from("contact_tags")
    .upsert({ contact_id: ctx.contactId, tag_id: tagId }, { onConflict: "contact_id,tag_id" });
  if (error) return { type: action.type, ok: false, detail: error.message };
  return { type: action.type, ok: true };
}

async function removeTagAction(
  ctx: AutomationTriggerContext,
  action: Extract<ActionDef, { type: "remove_tag" }>,
): Promise<ActionResult> {
  if (!ctx.contactId) return { type: action.type, ok: false, detail: "no contact on this trigger" };
  const { data: tag } = await supabaseAdmin
    .from("tags")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("name", action.tagName)
    .maybeSingle();
  if (!tag) return { type: action.type, ok: true, detail: "tag did not exist" };
  const { error } = await supabaseAdmin
    .from("contact_tags")
    .delete()
    .eq("contact_id", ctx.contactId)
    .eq("tag_id", tag.id);
  if (error) return { type: action.type, ok: false, detail: error.message };
  return { type: action.type, ok: true };
}

async function updateContactAction(
  ctx: AutomationTriggerContext,
  action: Extract<ActionDef, { type: "update_contact" }>,
): Promise<ActionResult> {
  if (!ctx.contactId) return { type: action.type, ok: false, detail: "no contact on this trigger" };
  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("custom_fields")
    .eq("id", ctx.contactId)
    .maybeSingle();
  const existingFields = (contact?.custom_fields ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...existingFields, ...action.customFields };
  const { error } = await supabaseAdmin
    .from("contacts")
    .update({
      custom_fields: JSON.parse(JSON.stringify(merged)),
      updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.contactId);
  if (error) return { type: action.type, ok: false, detail: error.message };
  return { type: action.type, ok: true };
}

async function assignAgentAction(
  ctx: AutomationTriggerContext,
  action: Extract<ActionDef, { type: "assign_agent" }>,
): Promise<ActionResult> {
  if (!ctx.conversationId)
    return { type: action.type, ok: false, detail: "no conversation on this trigger" };
  const { error: convError } = await supabaseAdmin
    .from("conversations")
    .update({ assigned_user_id: action.userId, updated_at: new Date().toISOString() })
    .eq("id", ctx.conversationId);
  if (convError) return { type: action.type, ok: false, detail: convError.message };

  await supabaseAdmin.from("conversation_assignments").insert({
    organization_id: ctx.organizationId,
    conversation_id: ctx.conversationId,
    assigned_user_id: action.userId,
    assigned_by: null,
    reason: "automation_rule",
  });
  return { type: action.type, ok: true };
}

async function callWebhookAction(
  ctx: AutomationTriggerContext,
  action: Extract<ActionDef, { type: "call_webhook" }>,
): Promise<ActionResult> {
  const { data: webhook } = await supabaseAdmin
    .from("outgoing_webhooks")
    .select("id, target_url, is_enabled")
    .eq("id", action.outgoingWebhookId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!webhook || !webhook.is_enabled)
    return { type: action.type, ok: false, detail: "outgoing webhook not found or disabled" };

  const payload = {
    trigger_type: ctx.triggerType,
    organization_id: ctx.organizationId,
    whatsapp_number_id: ctx.whatsappNumberId,
    contact_id: ctx.contactId,
    conversation_id: ctx.conversationId,
    message_id: ctx.messageId,
  };

  const { data: delivery } = await supabaseAdmin
    .from("outgoing_webhook_deliveries")
    .insert({
      organization_id: ctx.organizationId,
      outgoing_webhook_id: webhook.id,
      event_type: `automation.${ctx.triggerType}`,
      payload,
      status: "sending",
      attempt: 1,
    })
    .select("id")
    .single();
  const deliveryId = delivery?.id;
  if (!deliveryId)
    return { type: action.type, ok: false, detail: "unable to record webhook delivery" };

  try {
    const res = await fetch(webhook.target_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const excerpt = (await res.text().catch(() => "")).slice(0, 500);
    await supabaseAdmin
      .from("outgoing_webhook_deliveries")
      .update({
        status: res.ok ? "delivered" : "failed",
        http_status: res.status,
        response_excerpt: excerpt,
        delivered_at: res.ok ? new Date().toISOString() : null,
      })
      .eq("id", deliveryId);
    return res.ok
      ? { type: action.type, ok: true }
      : { type: action.type, ok: false, detail: `HTTP ${res.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "network error";
    await supabaseAdmin
      .from("outgoing_webhook_deliveries")
      .update({ status: "failed", response_excerpt: message })
      .eq("id", deliveryId);
    return { type: action.type, ok: false, detail: message };
  }
}

export async function executeAction(
  ctx: AutomationTriggerContext,
  action: ActionDef,
): Promise<ActionResult> {
  switch (action.type) {
    case "send_message":
      return sendMessageAction(ctx, action);
    case "send_template":
      return sendTemplateAction(ctx, action);
    case "add_tag":
      return addTagAction(ctx, action);
    case "remove_tag":
      return removeTagAction(ctx, action);
    case "update_contact":
      return updateContactAction(ctx, action);
    case "assign_agent":
      return assignAgentAction(ctx, action);
    case "call_webhook":
      return callWebhookAction(ctx, action);
    default:
      return { type: (action as ActionDef).type, ok: false, detail: "unknown action type" };
  }
}
