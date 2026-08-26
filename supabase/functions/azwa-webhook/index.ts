import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { constantTimeEqual, hmacSha256Hex, normalizeMetaSignature, sha256Hex } from "../_shared/crypto.ts";
import { json, text } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { drainQueues } from "../_shared/worker.ts";

Deno.serve(async (req: Request) => {
  const client = serviceClient();
  try {
    if (req.method === "GET") return await handleVerification(req, client);
    if (req.method !== "POST") return text("Method Not Allowed", 405, { Allow: "GET, POST" });
    return await handleWebhook(req, client);
  } catch (error) {
    console.error("azwa-webhook failure", error);
    return json({ error: "webhook_internal_error" }, 500);
  }
});

async function handleVerification(req: Request, client: any): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode !== "subscribe" || !token || challenge === null) return text("Bad Request", 400);

  const { data: secrets, error } = await client.rpc("backend_list_webhook_secrets");
  if (error) {
    console.error("webhook secret lookup failed", error.message);
    return text("Service Unavailable", 503);
  }
  const matched = (secrets ?? []).some((row: any) => row.verify_token && constantTimeEqual(String(row.verify_token), token));
  return matched ? text(challenge, 200) : text("Forbidden", 403);
}

async function handleWebhook(req: Request, client: any): Promise<Response> {
  const raw = await req.arrayBuffer();
  const signature = normalizeMetaSignature(req.headers.get("x-hub-signature-256"));
  if (!signature) return text("Unauthorized", 401);

  const { data: secrets, error: secretError } = await client.rpc("backend_list_webhook_secrets");
  if (secretError) {
    console.error("webhook secret lookup failed", secretError.message);
    return text("Service Unavailable", 503);
  }

  let matched: any = null;
  for (const row of secrets ?? []) {
    if (!row.app_secret) continue;
    const expected = await hmacSha256Hex(String(row.app_secret), raw);
    if (constantTimeEqual(expected, signature)) {
      matched = row;
      break;
    }
  }
  if (!matched) return text("Unauthorized", 401);

  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return text("Bad Request", 400);
  }
  const firstEntry = Array.isArray(payload?.entry) ? payload.entry[0] : null;
  const firstChange = Array.isArray(firstEntry?.changes) ? firstEntry.changes[0] : null;
  const value = firstChange?.value ?? {};
  const metaWabaId = firstEntry?.id != null ? String(firstEntry.id) : null;
  const metaPhoneNumberId = value?.metadata?.phone_number_id != null ? String(value.metadata.phone_number_id) : null;
  const eventType = firstChange?.field ? String(firstChange.field) : "unknown";
  const metaMessageId = value?.messages?.[0]?.id ?? value?.statuses?.[0]?.id ?? null;
  const deduplicationKey = await sha256Hex(raw);

  const { data: ingest, error: ingestError } = await client.rpc("backend_ingest_webhook_event", {
    p_organization_id: matched.organization_id,
    p_webhook_endpoint_id: matched.webhook_endpoint_id,
    p_meta_app_id: matched.meta_app_id,
    p_meta_waba_id: metaWabaId,
    p_meta_phone_number_id: metaPhoneNumberId,
    p_event_type: eventType,
    p_meta_message_id: metaMessageId,
    p_deduplication_key: deduplicationKey,
    p_signature_valid: true,
    p_payload: payload,
  });
  if (ingestError) {
    console.error("webhook persistence failed", { code: ingestError.code, message: ingestError.message });
    return text("Service Unavailable", 503);
  }

  const background = drainQueues(client, {
    workerId: `webhook:${ingest?.event_id ?? crypto.randomUUID()}`,
    queues: ["webhook-events", "media-downloads", "automation", "message-send", "outgoing-webhooks"],
    batchSize: 20,
    maxBatches: 5,
    maxRuntimeMs: 25_000,
  }).catch((e) => console.error("post-webhook worker failed", e));
  waitUntil(background);

  return text("EVENT_RECEIVED", 200);
}

function waitUntil(promise: Promise<unknown>): void {
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(promise);
  else void promise;
}
