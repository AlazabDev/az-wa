/**
 * Central Meta WhatsApp webhook gateway.
 *
 * Contract:
 *   verify signature -> persist each change -> enqueue processing -> HTTP 200.
 *
 * Heavy work (messages, statuses, templates, flows, alerts, media discovery)
 * runs in the webhook worker and never blocks Meta's delivery acknowledgement.
 */
import { createHash, randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin, supabaseRuntimeAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { drainMediaQueue } from "@/lib/meta/media.server";
import { drainWebhookQueue } from "@/lib/meta/webhook-worker.server";
import { listWebhookSecrets, matchSignature, matchVerifyToken } from "@/lib/meta/webhook.server";

type MetaMessage = Record<string, unknown> & { id?: string };
type MetaStatus = Record<string, unknown> & { id?: string };

type Change = {
  field?: string;
  value?: Record<string, unknown> & {
    metadata?: { phone_number_id?: string; display_phone_number?: string };
    messages?: MetaMessage[];
    statuses?: MetaStatus[];
    message_template_id?: string | number;
  };
};

type MetaWebhookPayload = { entry?: Array<{ id?: string; changes?: Change[] }> };

type IngestResult = {
  event_id?: string;
  attempt?: number;
  status?: string;
  whatsapp_number_id?: string | null;
  waba_id?: string | null;
};

function deduplicationKey(raw: string, entryIndex: number, changeIndex: number) {
  return createHash("sha256").update(`${raw}:${entryIndex}:${changeIndex}`, "utf8").digest("hex");
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function nullableDbString(value: string | null | undefined): string {
  return value ?? (null as unknown as string);
}

function asIngestResult(value: unknown): IngestResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as IngestResult;
}

async function auditMetaRequest(input: {
  organizationId: string | null;
  webhookEndpointId?: string | null;
  method: "GET" | "POST";
  verificationType: "verify_token" | "signature";
  verificationValid: boolean;
  httpStatus: number;
  eventType?: string | null;
  metaWabaId?: string | null;
  metaPhoneNumberId?: string | null;
}) {
  if (!input.organizationId) return;

  const { error } = await supabaseRuntimeAdmin.from("meta_webhook_request_audit").insert({
    organization_id: input.organizationId,
    webhook_endpoint_id: input.webhookEndpointId ?? null,
    method: input.method,
    verification_type: input.verificationType,
    verification_valid: input.verificationValid,
    http_status: input.httpStatus,
    event_type: input.eventType ?? null,
    meta_waba_id: input.metaWabaId ?? null,
    meta_phone_number_id: input.metaPhoneNumberId ?? null,
    request_id: randomUUID(),
  });

  if (error) console.error("[AzWA webhook] request audit failed", error);
}

async function enqueueWebhookProcessing(input: {
  organizationId: string;
  eventId: string;
  eventType: string;
}) {
  const { error } = await supabaseRuntimeAdmin.from("jobs").insert({
    organization_id: input.organizationId,
    queue_name: "webhook-process",
    job_type: "process_meta_webhook",
    deduplication_key: `webhook:${input.eventId}`,
    priority: 10,
    payload: { event_id: input.eventId, event_type: input.eventType },
    status: "queued",
    max_attempts: 8,
  });

  if (error && error.code !== "23505") {
    throw new Error(`Unable to enqueue webhook event ${input.eventId}: ${error.message}`);
  }
}

function kickWebhookWorker() {
  const workerId = `webhook-live-${randomUUID()}`;
  setImmediate(() => {
    void (async () => {
      await drainWebhookQueue(25, workerId);
      await drainMediaQueue(25);
    })().catch((error) => {
      console.error("[AzWA webhook] immediate webhook/media drain failed", error);
    });
  });
}

export const Route = createFileRoute("/api/public/webhooks/meta/whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        const secrets = await listWebhookSecrets();
        const endpoint = matchVerifyToken(secrets, token);

        if (mode !== "subscribe") {
          await auditMetaRequest({
            organizationId: secrets[0]?.organization_id ?? null,
            webhookEndpointId: secrets[0]?.webhook_endpoint_id ?? null,
            method: "GET",
            verificationType: "verify_token",
            verificationValid: false,
            httpStatus: 400,
          });
          return new Response("Bad Request", { status: 400 });
        }

        if (!endpoint) {
          await auditMetaRequest({
            organizationId: secrets[0]?.organization_id ?? null,
            webhookEndpointId: secrets[0]?.webhook_endpoint_id ?? null,
            method: "GET",
            verificationType: "verify_token",
            verificationValid: false,
            httpStatus: 403,
          });
          return new Response("Forbidden", { status: 403 });
        }

        await auditMetaRequest({
          organizationId: endpoint.organization_id,
          webhookEndpointId: endpoint.webhook_endpoint_id,
          method: "GET",
          verificationType: "verify_token",
          verificationValid: true,
          httpStatus: 200,
        });
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

        if (!endpoint || !signatureValid) {
          await auditMetaRequest({
            organizationId: endpoint?.organization_id ?? secrets[0]?.organization_id ?? null,
            webhookEndpointId: endpoint?.webhook_endpoint_id ?? secrets[0]?.webhook_endpoint_id ?? null,
            method: "POST",
            verificationType: "signature",
            verificationValid: false,
            httpStatus: 401,
          });
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: MetaWebhookPayload;
        try {
          payload = JSON.parse(raw) as MetaWebhookPayload;
        } catch {
          await auditMetaRequest({
            organizationId: endpoint.organization_id,
            webhookEndpointId: endpoint.webhook_endpoint_id,
            method: "POST",
            verificationType: "signature",
            verificationValid: true,
            httpStatus: 400,
          });
          return new Response("Bad Request", { status: 400 });
        }

        const firstEntry = payload.entry?.[0];
        const firstChange = firstEntry?.changes?.[0];
        const firstValue = firstChange?.value ?? {};
        await auditMetaRequest({
          organizationId: endpoint.organization_id,
          webhookEndpointId: endpoint.webhook_endpoint_id,
          method: "POST",
          verificationType: "signature",
          verificationValid: true,
          httpStatus: 200,
          eventType: firstChange?.field ?? "unknown",
          metaWabaId: firstEntry?.id ?? null,
          metaPhoneNumberId: firstValue.metadata?.phone_number_id ?? null,
        });

        let queuedAny = false;
        try {
          for (const [entryIndex, entry] of (payload.entry ?? []).entries()) {
            for (const [changeIndex, change] of (entry.changes ?? []).entries()) {
              const value = change.value ?? {};
              const metaPhoneId = value.metadata?.phone_number_id ?? null;
              const metaWabaId = entry.id ?? null;
              const templateEventId =
                value.message_template_id != null ? String(value.message_template_id) : null;
              const firstMessageId =
                value.messages?.[0]?.id ?? value.statuses?.[0]?.id ?? templateEventId ?? null;
              const eventType = change.field ?? "unknown";

              const { data: ingestData, error: ingestError } = await supabaseAdmin.rpc(
                "backend_ingest_webhook_event",
                {
                  p_organization_id: endpoint.organization_id,
                  p_webhook_endpoint_id: endpoint.webhook_endpoint_id,
                  p_meta_app_id: nullableDbString(endpoint.meta_app_id),
                  p_meta_waba_id: nullableDbString(metaWabaId),
                  p_meta_phone_number_id: nullableDbString(metaPhoneId),
                  p_event_type: eventType,
                  p_meta_message_id: nullableDbString(firstMessageId),
                  p_deduplication_key: deduplicationKey(raw, entryIndex, changeIndex),
                  p_signature_valid: true,
                  p_payload: asJson({ entry_id: metaWabaId, change }),
                },
              );
              if (ingestError) {
                throw new Error(`Webhook persistence failed: ${ingestError.message}`);
              }

              const ingest = asIngestResult(ingestData);
              if (!ingest.event_id) {
                throw new Error("Webhook persistence returned no event_id");
              }

              if (ingest.status === "processing") {
                await enqueueWebhookProcessing({
                  organizationId: endpoint.organization_id,
                  eventId: ingest.event_id,
                  eventType,
                });
                queuedAny = true;
              }
            }
          }
        } catch (error) {
          console.error("[AzWA webhook] persistence/queue failure", error);
          return new Response("Service Unavailable", { status: 503 });
        }

        if (queuedAny) kickWebhookWorker();
        return new Response("EVENT_RECEIVED", { status: 200 });
      },
    },
  },
});
