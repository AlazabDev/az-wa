import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SendTemplateInput = {
  numberId: string;
  templateId: string;
  recipient: string;
  components?: Record<string, unknown>[];
  bodyParameters?: string[];
};

function normalizeRecipient(value: string) {
  return value.replace(/[^0-9]/g, "");
}

function bodyRuntimeComponent(values: string[]) {
  if (values.length === 0) return null;
  return {
    type: "body",
    parameters: values.map((text) => ({ type: "text", text })),
  };
}

export const sendTemplateMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: SendTemplateInput) => input)
  .handler(async ({ data, context }) => {
    const recipient = normalizeRecipient(data.recipient);
    if (!data.numberId) throw new Error("Send-from number is required");
    if (!data.templateId) throw new Error("Template is required");
    if (recipient.length < 7 || recipient.length > 20) throw new Error("Recipient number is invalid");

    const { data: allowed, error: permissionError } = await context.supabase.rpc(
      "azwa_can_send_number",
      { p_number_id: data.numberId },
    );
    if (permissionError || !allowed) throw new Error("You are not allowed to send from this number");

    const { data: number, error: numberError } = await context.supabase
      .from("whatsapp_numbers")
      .select("id, organization_id, waba_id, is_enabled, status")
      .eq("id", data.numberId)
      .maybeSingle();
    if (numberError || !number) throw new Error("WhatsApp number not found or not accessible");
    if (!number.is_enabled || number.status !== "active") throw new Error("WhatsApp number is not active");

    const { data: template, error: templateError } = await context.supabase
      .from("templates")
      .select("id, organization_id, waba_id, name, language, status")
      .eq("id", data.templateId)
      .maybeSingle();
    if (templateError || !template) throw new Error("Template not found or not accessible");
    if (template.organization_id !== number.organization_id) throw new Error("Template and number belong to different organizations");
    if (template.waba_id !== number.waba_id) throw new Error("Template can only be sent from a number in the same WABA");
    if (String(template.status).toLowerCase() !== "approved") throw new Error("Only approved Meta templates can be sent");

    const { client, number: numberScope } = await import("./graph.server").then((m) =>
      m.clientForNumber(data.numberId),
    );
    if (!client || !numberScope) throw new Error("No active Meta credential is available for this number");

    const explicitComponents = Array.isArray(data.components) ? data.components : [];
    const bodyComponent = bodyRuntimeComponent(data.bodyParameters ?? []);
    const runtimeComponents = explicitComponents.length > 0
      ? explicitComponents
      : bodyComponent
        ? [bodyComponent]
        : [];

    const requestPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        ...(runtimeComponents.length > 0 ? { components: runtimeComponents } : {}),
      },
    };

    const { supabaseAdmin, supabaseRuntimeAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const idempotencyKey = `template-ui:${context.userId}:${crypto.randomUUID()}`;

    const { data: outbox, error: outboxError } = await supabaseRuntimeAdmin
      .from("message_outbox")
      .insert({
        organization_id: number.organization_id,
        whatsapp_number_id: data.numberId,
        recipient_address: recipient,
        message_type: "template",
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
      throw new Error(outboxError?.message ?? "Unable to create durable template outbox record");
    }

    const outboxId = String(outbox.id);
    const result = await client.request<{ messages?: Array<{ id?: string }> }>(
      `${numberScope.meta_phone_number_id}/messages`,
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
      throw new Error(result.errorMessage ?? `Meta template send failed with HTTP ${result.status}`);
    }

    const metaMessageId = result.data?.messages?.[0]?.id ?? null;
    if (!metaMessageId) {
      await supabaseAdmin.rpc("backend_finalize_outbox_failure", {
        p_outbox_id: outboxId,
        p_error: "Meta accepted the template request without returning a message ID",
        p_final: true,
      });
      throw new Error("Meta accepted the template request without returning a message ID");
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
      templateId: template.id,
    };
  });
