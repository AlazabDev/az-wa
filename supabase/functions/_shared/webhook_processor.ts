import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { enqueueAutomationsForInbound } from "./automation.ts";
import { emitOutgoingEvent } from "./events.ts";

export async function processWebhookEvent(client: SupabaseClient, webhookEventId: string): Promise<void> {
  const { data: event, error } = await client.from("webhook_events").select("*").eq("id", webhookEventId).single();
  if (error || !event) throw new Error("Webhook event not found");
  if (["processed", "ignored"].includes(event.status)) return;
  if (event.status === "unmapped_number_event") return;

  const attemptNo = Number(event.attempts ?? 0) + 1;
  const { data: attempt } = await client.from("webhook_event_attempts").upsert({
    organization_id: event.organization_id,
    webhook_event_id: event.id,
    attempt_no: attemptNo,
    status: "started",
    started_at: new Date().toISOString(),
  }, { onConflict: "webhook_event_id,attempt_no" }).select("id").single();

  await client.from("webhook_events").update({ status: "processing", attempts: attemptNo, error: null }).eq("id", event.id);
  try {
    const payload = event.payload as any;
    let processedMessages = 0;
    let processedStatuses = 0;
    let ignoredChanges = 0;

    for (const entry of array(payload?.entry)) {
      for (const change of array(entry?.changes)) {
        if (change?.field !== "messages") {
          ignoredChanges += 1;
          continue;
        }
        const value = change?.value ?? {};
        const metaPhoneNumberId = String(value?.metadata?.phone_number_id ?? event.meta_phone_number_id ?? "");
        if (!metaPhoneNumberId) throw new Error("Webhook change missing metadata.phone_number_id");
        const contacts = new Map<string, string>();
        for (const c of array(value?.contacts)) {
          if (c?.wa_id) contacts.set(String(c.wa_id), String(c?.profile?.name ?? ""));
        }

        for (const message of array(value?.messages)) {
          const waId = String(message?.from ?? "");
          const profileName = contacts.get(waId) ?? null;
          const { data: result, error: ingestError } = await client.rpc("backend_ingest_inbound_message", {
            p_organization_id: event.organization_id,
            p_meta_phone_number_id: metaPhoneNumberId,
            p_contact_wa_id: waId,
            p_contact_profile_name: profileName,
            p_message: message,
          });
          if (ingestError) throw new Error(`Inbound message persistence failed: ${ingestError.message}`);
          processedMessages += 1;

          if (result?.status === "inserted") {
            await enqueueAutomationsForInbound(client, {
              organizationId: result.organization_id,
              whatsappNumberId: result.whatsapp_number_id,
              messageId: result.message_id,
              conversationId: result.conversation_id,
              contactId: result.contact_id,
              contactWaId: waId,
              message,
              mediaId: result.media_id ?? null,
            }).catch((e) => console.error("automation enqueue failed", e));

            await emitOutgoingEvent(client, result.organization_id, "message.received", result.message_id, {
              message_id: result.message_id,
              meta_message_id: message?.id ?? null,
              whatsapp_number_id: result.whatsapp_number_id,
              contact_id: result.contact_id,
              conversation_id: result.conversation_id,
              message_type: result.message_type,
            }).catch((e) => console.error("outgoing event enqueue failed", e));

            if (result.media_id) {
              await emitOutgoingEvent(client, result.organization_id, "media.received", result.media_id, {
                media_id: result.media_id,
                message_id: result.message_id,
                whatsapp_number_id: result.whatsapp_number_id,
                contact_id: result.contact_id,
              }).catch(() => undefined);
            }
          }
        }

        for (const status of array(value?.statuses)) {
          const { data: result, error: statusError } = await client.rpc("backend_apply_message_status", {
            p_organization_id: event.organization_id,
            p_meta_phone_number_id: metaPhoneNumberId,
            p_status: status,
          });
          if (statusError) throw new Error(`Message status persistence failed: ${statusError.message}`);
          processedStatuses += 1;
          if (result?.status === "applied") {
            const eventName = `message.${String(result.message_status ?? "status")}`;
            await emitOutgoingEvent(client, event.organization_id, eventName, result.message_id, {
              message_id: result.message_id,
              meta_message_id: status?.id ?? null,
              whatsapp_number_id: event.whatsapp_number_id,
              status: result.message_status,
            }).catch(() => undefined);
          }
        }
      }
    }

    await client.from("webhook_events").update({
      status: processedMessages === 0 && processedStatuses === 0 ? "ignored" : "processed",
      processed_at: new Date().toISOString(),
      error: null,
    }).eq("id", event.id);
    if (attempt?.id) {
      await client.from("webhook_event_attempts").update({
        status: processedMessages === 0 && processedStatuses === 0 ? "ignored" : "processed",
        completed_at: new Date().toISOString(),
      }).eq("id", attempt.id);
    }
    if (event.webhook_endpoint_id) {
      await client.from("webhook_endpoints").update({ last_success_at: new Date().toISOString(), last_event_at: new Date().toISOString() }).eq("id", event.webhook_endpoint_id);
    }
    console.log("webhook processed", { webhook_event_id: event.id, processedMessages, processedStatuses, ignoredChanges });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client.from("webhook_events").update({ status: "failed", error: message }).eq("id", event.id);
    if (attempt?.id) {
      await client.from("webhook_event_attempts").update({ status: "failed", error: message, completed_at: new Date().toISOString() }).eq("id", attempt.id);
    }
    if (event.webhook_endpoint_id) {
      await client.from("webhook_endpoints").update({ last_failure_at: new Date().toISOString() }).eq("id", event.webhook_endpoint_id);
    }
    throw error;
  }
}

function array(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}
