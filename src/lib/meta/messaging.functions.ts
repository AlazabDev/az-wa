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
  .validator((input: SendTextInput) => input)
  .handler(async ({ data, context }) => {
    let recipient = normalizeRecipient(data.recipient);
    const body = data.body.trim();

    if (!data.numberId) throw new Error("Send-from number is required");
    if (!data.conversationId && (recipient.length < 7 || recipient.length > 20))
      throw new Error("Recipient number is invalid");
    if (!body) throw new Error("Message body is required");
    if (body.length > 4096) throw new Error("Text message exceeds 4096 characters");

    const { data: allowed, error: permissionError } = await context.supabase.rpc(
      "azwa_can_send_number",
      { p_number_id: data.numberId },
    );
    if (permissionError || !allowed)
      throw new Error("You are not allowed to send from this number");

    const { client, number } = await import("./graph.server").then((m) =>
      m.clientForNumber(data.numberId),
    );
    if (!client || !number)
      throw new Error("No active Meta credential is available for this number");

    const { supabaseAdmin, supabaseRuntimeAdmin } =
      await import("@/integrations/supabase/client.server");

    let verifiedContactId: string | null = null;
    if (data.conversationId) {
      // Replies must resolve their destination from the authenticated
      // conversation, not from a contact UUID supplied by the browser.
      const { data: conversation, error: conversationError } = await supabaseRuntimeAdmin
        .from("conversations")
        .select("id, organization_id, whatsapp_number_id, contact_id")
        .eq("id", data.conversationId)
        .eq("organization_id", number.organization_id)
        .eq("whatsapp_number_id", data.numberId)
        .maybeSingle();
      if (conversationError || !conversation)
        throw new Error("Conversation is unavailable for this WhatsApp number");
      verifiedContactId = conversation.contact_id ?? null;
      if (!verifiedContactId || (data.contactId && data.contactId !== verifiedContactId))
        throw new Error("Conversation contact is not available");

      const { data: channel, error: channelError } = await supabaseRuntimeAdmin
        .from("contact_channels")
        .select("address")
        .eq("organization_id", number.organization_id)
        .eq("contact_id", verifiedContactId)
        .eq("channel_type", "whatsapp")
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (channelError) throw new Error(channelError.message);
      recipient = normalizeRecipient(channel?.address ?? "");
      if (!recipient) {
        const { data: contact, error: contactError } = await supabaseRuntimeAdmin
          .from("contacts")
          .select("phone")
          .eq("organization_id", number.organization_id)
          .eq("id", verifiedContactId)
          .maybeSingle();
        if (contactError) throw new Error(contactError.message);
        recipient = normalizeRecipient(contact?.phone ?? "");
      }
    }
    if (recipient.length < 7 || recipient.length > 20)
      throw new Error("A valid WhatsApp recipient is required");

    const requestPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "text",
      text: { preview_url: false, body },
    };

    const idempotencyKey = `ui:${context.userId}:${crypto.randomUUID()}`;

    // Interactive sends are performed synchronously by this authenticated
    // server function. Store a durable outbox row in `sending` state, but do
    // not create a worker job — that prevents the worker and UI path from
    // racing and sending the same WhatsApp message twice.
    const { data: outbox, error: outboxError } = await supabaseRuntimeAdmin
      .from("message_outbox")
      .insert({
        organization_id: number.organization_id,
        whatsapp_number_id: data.numberId,
        contact_id: verifiedContactId,
        conversation_id: data.conversationId ?? null,
        recipient_address: recipient,
        message_type: "text",
        request_payload: requestPayload,
        idempotency_key: idempotencyKey,
        requested_by: context.userId,
        status: "sending",
        attempt_count: 0,
        next_attempt_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (outboxError || !outbox?.id) {
      throw new Error(outboxError?.message ?? "Unable to create durable message outbox record");
    }
    const outboxId = String(outbox.id);

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
        .from("whatsapp_numbers")
        .update({ last_api_failure_at: new Date().toISOString() })
        .eq("id", data.numberId);
      throw new Error(result.errorMessage ?? `Meta send failed with HTTP ${result.status}`);
    }

    const metaMessageId = result.data?.messages?.[0]?.id ?? null;
    if (!metaMessageId) {
      await supabaseAdmin.rpc("backend_finalize_outbox_failure", {
        p_outbox_id: outboxId,
        p_error: "Meta accepted the request without returning a message ID",
        p_final: true,
      });
      throw new Error("Meta accepted the request without returning a message ID");
    }

    const { error: finalizeError } = await supabaseAdmin.rpc("backend_finalize_outbox_success", {
      p_outbox_id: outboxId,
      p_meta_message_id: metaMessageId,
      p_raw_response: result.data ?? {},
    });
    if (finalizeError) throw new Error(finalizeError.message);

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
