import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SendTextInput = {
  numberId: string;
  recipient: string;
  body: string;
  conversationId?: string | null;
  contactId?: string | null;
};

function normalizeRecipient(value: string) {
  return value.replace(/[^0-9]/g, "");
}

export const sendTextMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SendTextInput) => input)
  .handler(async ({ data, context }) => {
    const recipient = normalizeRecipient(data.recipient);
    const body = data.body.trim();

    if (!data.numberId) throw new Error("Send-from number is required");
    if (recipient.length < 7 || recipient.length > 20) throw new Error("Recipient number is invalid");
    if (!body) throw new Error("Message body is required");
    if (body.length > 4096) throw new Error("Text message exceeds 4096 characters");

    const { data: allowed, error: permissionError } = await context.supabase.rpc(
      "azwa_can_send_number",
      { p_number_id: data.numberId },
    );
    if (permissionError || !allowed) throw new Error("You are not allowed to send from this number");

    const { client, number } = await import("./graph.server").then((m) => m.clientForNumber(data.numberId));
    if (!client || !number) throw new Error("No active Meta credential is available for this number");

    const requestPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "text",
      text: { preview_url: false, body },
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const idempotencyKey = `ui:${context.userId}:${crypto.randomUUID()}`;
    const { data: created, error: createError } = await supabaseAdmin.rpc("backend_create_outbox", {
      p_whatsapp_number_id: data.numberId,
      p_recipient_address: recipient,
      p_message_type: "text",
      p_request_payload: requestPayload,
      p_idempotency_key: idempotencyKey,
      p_requested_by: context.userId,
      p_contact_id: data.contactId ?? null,
      p_conversation_id: data.conversationId ?? null,
      p_campaign_id: null,
      p_campaign_recipient_id: null,
    });
    if (createError) throw new Error(createError.message);

    const createdObject = (created ?? {}) as Record<string, unknown>;
    const outboxId = typeof createdObject["outbox_id"] === "string" ? createdObject["outbox_id"] : null;
    if (!outboxId) throw new Error("Unable to create durable message outbox record");

    const result = await client.request<{ messages?: Array<{ id?: string }> }>(
      `${number.meta_phone_number_id}/messages`,
      { method: "POST", body: requestPayload },
    );

    if (!result.ok) {
      await supabaseAdmin.rpc("backend_finalize_outbox_failure", {
        p_outbox_id: outboxId,
        p_error: result.errorMessage ?? `HTTP ${result.status}`,
        p_final: true,
      });
      await supabaseAdmin
        .from("jobs")
        .update({
          status: "failed",
          last_error: result.errorMessage ?? `HTTP ${result.status}`,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("queue_name", "message-send")
        .eq("deduplication_key", `outbox:${outboxId}`);
      throw new Error(result.errorMessage ?? `Meta send failed with HTTP ${result.status}`);
    }

    const metaMessageId = result.data?.messages?.[0]?.id ?? null;
    if (!metaMessageId) throw new Error("Meta accepted the request without returning a message ID");

    const { error: finalizeError } = await supabaseAdmin.rpc("backend_finalize_outbox_success", {
      p_outbox_id: outboxId,
      p_meta_message_id: metaMessageId,
      p_raw_response: result.data ?? {},
    });
    if (finalizeError) throw new Error(finalizeError.message);

    await supabaseAdmin
      .from("jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("queue_name", "message-send")
      .eq("deduplication_key", `outbox:${outboxId}`);

    await supabaseAdmin
      .from("whatsapp_numbers")
      .update({
        last_outgoing_message_at: new Date().toISOString(),
        last_api_success_at: new Date().toISOString(),
      })
      .eq("id", data.numberId);

    return {
      ok: true,
      outboxId,
      metaMessageId,
      recipient,
      numberId: data.numberId,
    };
  });
