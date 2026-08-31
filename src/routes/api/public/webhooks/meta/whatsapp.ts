/**
 * Central Meta WhatsApp webhook gateway.
 * One endpoint handles every WABA and phone number. Each change is ingested
 * independently so an unmapped number never suppresses valid sibling events.
 */
import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { syncWabaFlows } from "@/lib/meta/flows.server";
import { drainMediaQueue } from "@/lib/meta/media.server";
import {
  applyTemplateWebhookChange,
  isTemplateWebhookField,
} from "@/lib/meta/template-webhook.server";
import { listWebhookSecrets, matchSignature, matchVerifyToken } from "@/lib/meta/webhook.server";

type MetaMessage = Record<string, unknown> & { id?: string; from?: string; type?: string };
type MetaStatus = Record<string, unknown> & { id?: string; status?: string };
type MetaContact = { wa_id?: string; profile?: { name?: string } };

type Change = {
  field?: string;
  value?: Record<string, unknown> & {
    metadata?: { phone_number_id?: string; display_phone_number?: string };
    contacts?: MetaContact[];
    messages?: MetaMessage[];
    statuses?: MetaStatus[];
    message_template_id?: string | number;
  };
};

type MetaWebhookPayload = { entry?: Array<{ id?: string; changes?: Change[] }> };

const MEDIA_MESSAGE_TYPES = new Set(["image", "video", "audio", "document", "sticker"]);
const OPERATIONAL_ALERT_FIELDS = new Set([
  "security",
  "account_alerts",
  "account_update",
  "account_review_update",
  "business_capability_update",
  "phone_number_quality_update",
  "phone_number_name_update",
]);

function deduplicationKey(raw: string, entryIndex: number, changeIndex: number) {
  return createHash("sha256").update(`${raw}:${entryIndex}:${changeIndex}`, "utf8").digest("hex");
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function nullableDbString(value: string | null | undefined): string {
  return value ?? (null as unknown as string);
}

async function ensureUnknownNumberAlert(
  organizationId: string,
  metaPhoneNumberId: string,
  metaWabaId: string | null,
  displayPhoneNumber: string | null,
) {
  const { data: existing } = await supabaseAdmin
    .from("alerts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("alert_type", "unknown_whatsapp_number")
    .eq("status", "open")
    .contains("details", { meta_phone_number_id: metaPhoneNumberId })
    .limit(1)
    .maybeSingle();
  if (existing) return;

  const { error } = await supabaseAdmin.from("alerts").insert({
    organization_id: organizationId,
    alert_type: "unknown_whatsapp_number",
    severity: "critical",
    title: "Unknown WhatsApp Phone Number",
    message: `Webhook received for unmapped Meta phone_number_id ${metaPhoneNumberId}`,
    status: "open",
    details: {
      meta_phone_number_id: metaPhoneNumberId,
      meta_waba_id: metaWabaId,
      display_phone_number: displayPhoneNumber,
    },
  });
  if (error) console.error("[AzWA webhook] unable to create unknown-number alert", error.message);
}

async function ensureOperationalAlert(
  organizationId: string,
  metaWabaId: string | null,
  field: string,
  value: Record<string, unknown>,
) {
  const alertType = `meta_${field}`;
  const { data: existing } = await supabaseAdmin
    .from("alerts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("alert_type", alertType)
    .eq("status", "open")
    .contains("details", { meta_waba_id: metaWabaId, field })
    .limit(1)
    .maybeSingle();
  if (existing) return;

  const severity = field === "security" || field === "account_alerts" ? "critical" : "warning";
  const { error } = await supabaseAdmin.from("alerts").insert({
    organization_id: organizationId,
    alert_type: alertType,
    severity,
    title: `Meta WhatsApp: ${field}`,
    message: `Operational webhook received for WABA ${metaWabaId ?? "unknown"}`,
    status: "open",
    details: { meta_waba_id: metaWabaId, field, value: asJson(value) },
  });
  if (error) console.error(`[AzWA webhook] unable to create ${field} alert`, error.message);
}

async function refreshFlowsFromWebhook(organizationId: string, metaWabaId: string | null) {
  if (!metaWabaId) return;
  const { data: waba } = await supabaseAdmin
    .from("wabas")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("meta_waba_id", metaWabaId)
    .maybeSingle();
  if (!waba) return;
  void syncWabaFlows(waba.id).catch((error) =>
    console.error("[AzWA webhook] flow refresh failed", error),
  );
}

export const Route = createFileRoute("/api/public/webhooks/meta/whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        if (mode !== "subscribe") return new Response("Bad Request", { status: 400 });

        const secrets = await listWebhookSecrets();
        const endpoint = matchVerifyToken(secrets, token);
        if (!endpoint) return new Response("Forbidden", { status: 403 });
        return new Response(challenge, { status: 200 });
      },

      POST: async ({ request }) => {
        const raw = await request.text();
        const secrets = await listWebhookSecrets();
        const { endpoint, signatureValid } = matchSignature(
          secrets,
          raw,
          request.headers.get("x-hub-signature-256"),
        );
        if (!endpoint || !signatureValid) return new Response("Unauthorized", { status: 401 });

        let payload: MetaWebhookPayload;
        try {
          payload = JSON.parse(raw) as MetaWebhookPayload;
        } catch {
          return new Response("Bad Request", { status: 400 });
        }

        let inboundMediaSeen = false;

        for (const [entryIndex, entry] of (payload.entry ?? []).entries()) {
          for (const [changeIndex, change] of (entry.changes ?? []).entries()) {
            const value = change.value ?? {};
            const metaPhoneId = value.metadata?.phone_number_id ?? null;
            const metaWabaId = entry.id ?? null;
            const templateEventId =
              value.message_template_id != null ? String(value.message_template_id) : null;
            const firstMessageId =
              value.messages?.[0]?.id ?? value.statuses?.[0]?.id ?? templateEventId ?? null;

            const { data: ingest, error: ingestError } = await supabaseAdmin.rpc(
              "backend_ingest_webhook_event",
              {
                p_organization_id: endpoint.organization_id,
                p_webhook_endpoint_id: endpoint.webhook_endpoint_id,
                p_meta_app_id: nullableDbString(endpoint.meta_app_id),
                p_meta_waba_id: nullableDbString(metaWabaId),
                p_meta_phone_number_id: nullableDbString(metaPhoneId),
                p_event_type: change.field ?? "unknown",
                p_meta_message_id: nullableDbString(firstMessageId),
                p_deduplication_key: deduplicationKey(raw, entryIndex, changeIndex),
                p_signature_valid: true,
                p_payload: asJson({ entry_id: metaWabaId, change }),
              },
            );
            if (ingestError) {
              console.error("[AzWA webhook] event persistence failed", ingestError.message);
              return new Response("Service Unavailable", { status: 503 });
            }

            if (isTemplateWebhookField(change.field)) {
              const applied = await applyTemplateWebhookChange({
                organizationId: endpoint.organization_id,
                metaWabaId,
                field: change.field,
                value,
              });
              if (applied.handled && !applied.updated && applied.error) {
                console.error("[AzWA webhook] template lifecycle update failed", applied.error);
              }
            }

            if (change.field === "flows") {
              await refreshFlowsFromWebhook(endpoint.organization_id, metaWabaId);
            }
            if (change.field && OPERATIONAL_ALERT_FIELDS.has(change.field)) {
              await ensureOperationalAlert(
                endpoint.organization_id,
                metaWabaId,
                change.field,
                value,
              );
            }

            const ingestStatus =
              ingest && typeof ingest === "object" && "status" in ingest
                ? String((ingest as Record<string, unknown>)["status"])
                : null;

            if (ingestStatus === "unmapped_number_event" && metaPhoneId) {
              await ensureUnknownNumberAlert(
                endpoint.organization_id,
                metaPhoneId,
                metaWabaId,
                value.metadata?.display_phone_number ?? null,
              );
              continue;
            }

            if (!metaPhoneId) continue;

            for (const message of value.messages ?? []) {
              const sender = typeof message.from === "string" ? message.from : null;
              const contact = (value.contacts ?? []).find(
                (candidate) => candidate.wa_id && candidate.wa_id === sender,
              );
              const { data: inbound, error: inboundError } = await supabaseAdmin.rpc(
                "backend_ingest_inbound_message",
                {
                  p_organization_id: endpoint.organization_id,
                  p_meta_phone_number_id: metaPhoneId,
                  p_contact_wa_id: nullableDbString(sender),
                  p_contact_profile_name: nullableDbString(contact?.profile?.name),
                  p_message: asJson(message),
                },
              );
              if (inboundError) {
                console.error("[AzWA webhook] inbound message ingest failed", inboundError.message);
                continue;
              }
              if (typeof message.type === "string" && MEDIA_MESSAGE_TYPES.has(message.type))
                inboundMediaSeen = true;
              if (
                inbound &&
                typeof inbound === "object" &&
                "status" in inbound &&
                String((inbound as Record<string, unknown>)["status"]) === "unmapped_number"
              ) {
                await ensureUnknownNumberAlert(
                  endpoint.organization_id,
                  metaPhoneId,
                  metaWabaId,
                  value.metadata?.display_phone_number ?? null,
                );
              }
            }

            for (const status of value.statuses ?? []) {
              const { data: applied, error: statusError } = await supabaseAdmin.rpc(
                "backend_apply_message_status",
                {
                  p_organization_id: endpoint.organization_id,
                  p_meta_phone_number_id: metaPhoneId,
                  p_status: asJson(status),
                },
              );
              if (statusError) {
                console.error("[AzWA webhook] message status ingest failed", statusError.message);
                continue;
              }
              if (
                applied &&
                typeof applied === "object" &&
                "status" in applied &&
                String((applied as Record<string, unknown>)["status"]) === "unmapped_number"
              ) {
                await ensureUnknownNumberAlert(
                  endpoint.organization_id,
                  metaPhoneId,
                  metaWabaId,
                  value.metadata?.display_phone_number ?? null,
                );
              }
            }
          }
        }

        if (inboundMediaSeen) {
          void drainMediaQueue(50).catch((error) =>
            console.error("[AzWA webhook] immediate media archive failed", error),
          );
        }
        return new Response("EVENT_RECEIVED", { status: 200 });
      },
    },
  },
});
