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
