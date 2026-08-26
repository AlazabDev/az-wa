import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { MetaApiError, metaFetch } from "./meta.ts";
import { emitOutgoingEvent } from "./events.ts";
import type { MetaScope } from "./types.ts";

export type WorkResult =
  | { action: "complete"; detail?: unknown }
  | { action: "retry"; error: string; retryAfterSeconds: number }
  | { action: "defer"; seconds: number; reason: string };

export async function sendOutboxMessage(client: SupabaseClient, outboxId: string, jobAttempt: number, maxAttempts: number): Promise<WorkResult> {
  const { data: outbox, error } = await client
    .from("message_outbox")
    .select("*,whatsapp_numbers!inner(id,organization_id,waba_id,meta_phone_number_id,wabas!inner(business_portfolio_id)),campaigns(status)")
    .eq("id", outboxId)
    .single();
  if (error || !outbox) return { action: "complete", detail: { reason: "outbox_not_found" } };
  if (["submitted", "sent", "delivered", "read", "cancelled"].includes(outbox.status)) {
    return { action: "complete", detail: { reason: `already_${outbox.status}` } };
  }
  if (outbox.status === "failed") return { action: "complete", detail: { reason: "already_failed" } };

  const campaign = Array.isArray(outbox.campaigns) ? outbox.campaigns[0] : outbox.campaigns;
  if (outbox.campaign_id && campaign && campaign.status !== "running") {
    if (["cancelled", "completed", "failed"].includes(campaign.status)) {
      await client.from("message_outbox").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", outbox.id);
      return { action: "complete", detail: { reason: `campaign_${campaign.status}` } };
    }
    return { action: "defer", seconds: 60, reason: `campaign_${campaign.status}` };
  }

  const number = outbox.whatsapp_numbers;
  const scope: MetaScope = {
    organizationId: outbox.organization_id,
    whatsappNumberId: number.id,
    wabaId: number.waba_id,
    businessPortfolioId: number.wabas.business_portfolio_id,
  };
  const attemptNo = Number(outbox.attempt_count ?? 0) + 1;
  const { data: attemptRow, error: attemptError } = await client.from("message_send_attempts").insert({
    organization_id: outbox.organization_id,
    outbox_id: outbox.id,
    attempt_no: attemptNo,
    status: "started",
  }).select("id").single();
  if (attemptError && attemptError.code !== "23505") throw new Error(`Unable to create send attempt: ${attemptError.message}`);

  await client.from("message_outbox").update({ status: "sending", last_error: null }).eq("id", outbox.id);

  const payload = normalizePayload(outbox.request_payload, outbox.recipient_address);
  try {
    const response: any = await metaFetch(client, scope, `${number.meta_phone_number_id}/messages`, {
      method: "POST",
      body: payload,
      correlationId: `outbox:${outbox.id}`,
    });
    const metaMessageId = response?.messages?.[0]?.id;
    if (!metaMessageId) {
      const err = "Meta accepted request without returning messages[0].id";
      await finalizeFailure(client, outbox.id, attemptRow?.id, attemptNo, err, null, null, true);
      return { action: "complete", detail: { reason: "missing_meta_message_id" } };
    }

    const { data: finalized, error: finalizeError } = await client.rpc("backend_finalize_outbox_success", {
      p_outbox_id: outbox.id,
      p_meta_message_id: String(metaMessageId),
      p_raw_response: response,
    });
    if (finalizeError) throw new Error(`Outbox finalization failed: ${finalizeError.message}`);
    if (attemptRow?.id) {
      await client.from("message_send_attempts").update({
        status: "submitted",
        http_status: 200,
        response_meta: { meta_message_id: metaMessageId },
      }).eq("id", attemptRow.id);
    }

    await emitOutgoingEvent(client, outbox.organization_id, "message.submitted", finalized?.message_id ?? null, {
      message_id: finalized?.message_id ?? null,
      meta_message_id: metaMessageId,
      whatsapp_number_id: outbox.whatsapp_number_id,
      contact_id: finalized?.contact_id ?? outbox.contact_id,
      conversation_id: finalized?.conversation_id ?? outbox.conversation_id,
      campaign_id: outbox.campaign_id,
    }).catch((e) => console.error("outgoing event enqueue failed", e));

    return { action: "complete", detail: { meta_message_id: metaMessageId, finalized } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const metaError = error instanceof MetaApiError ? error : null;
    const retryable = metaError ? isMetaRetryable(metaError) : false;
    const final = !retryable || jobAttempt >= maxAttempts;
    await finalizeFailure(
      client,
      outbox.id,
      attemptRow?.id,
      attemptNo,
      message,
      metaError?.httpStatus ?? null,
      metaError?.metaCode ?? null,
      final,
    );

    if (final) {
      await emitOutgoingEvent(client, outbox.organization_id, "message.failed", null, {
        outbox_id: outbox.id,
        whatsapp_number_id: outbox.whatsapp_number_id,
        recipient: outbox.recipient_address,
        error: message,
        meta_error_code: metaError?.metaCode ?? null,
      }).catch(() => undefined);
      return { action: "complete", detail: { failed: true, error: message } };
    }
    return { action: "retry", error: message, retryAfterSeconds: retryDelay(jobAttempt + 1) };
  }
}

function normalizePayload(payload: any, recipient: string): Record<string, unknown> {
  const result = { ...(payload || {}) } as Record<string, unknown>;
  result.messaging_product = "whatsapp";
  result.to = String(recipient).replace(/[^0-9]/g, "");
  if (!result.type) throw new Error("WhatsApp message payload is missing type");
  return result;
}

async function finalizeFailure(
  client: SupabaseClient,
  outboxId: string,
  attemptId: string | undefined,
  attemptNo: number,
  message: string,
  httpStatus: number | null,
  errorCode: string | null,
  final: boolean,
): Promise<void> {
  if (attemptId) {
    await client.from("message_send_attempts").update({
      status: "failed",
      http_status: httpStatus,
      error_code: errorCode,
      error_message: message,
      response_meta: { final },
    }).eq("id", attemptId);
  } else {
    await client.from("message_send_attempts").upsert({
      outbox_id: outboxId,
      organization_id: (await client.from("message_outbox").select("organization_id").eq("id", outboxId).single()).data?.organization_id,
      attempt_no: attemptNo,
      status: "failed",
      http_status: httpStatus,
      error_code: errorCode,
      error_message: message,
      response_meta: { final },
    }, { onConflict: "outbox_id,attempt_no" });
  }
  await client.rpc("backend_finalize_outbox_failure", {
    p_outbox_id: outboxId,
    p_error: message,
    p_final: final,
  });
}

function isMetaRetryable(error: MetaApiError): boolean {
  const transient = Boolean((error.payload as any)?.error?.is_transient);
  return error.httpStatus === 429 || transient;
}

function retryDelay(attempt: number): number {
  const schedule = [5, 30, 120, 600, 1800, 3600];
  return schedule[Math.min(Math.max(attempt - 1, 0), schedule.length - 1)];
}
