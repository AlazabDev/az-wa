import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { hmacSha256Hex } from "./crypto.ts";
import type { WorkResult } from "./outbox.ts";

export async function deliverOutgoingWebhook(
  client: SupabaseClient,
  deliveryId: string,
  jobAttempt: number,
  maxAttempts: number,
): Promise<WorkResult> {
  const { data: delivery, error } = await client
    .from("outgoing_webhook_deliveries")
    .select("*,outgoing_webhooks!inner(id,target_url,secret_reference,is_enabled)")
    .eq("id", deliveryId)
    .single();
  if (error || !delivery) return { action: "complete", detail: { reason: "delivery_not_found" } };
  if (delivery.status === "delivered") return { action: "complete", detail: { reason: "already_delivered" } };
  const hook = delivery.outgoing_webhooks;
  if (!hook.is_enabled) return { action: "complete", detail: { reason: "webhook_disabled" } };

  let url: URL;
  try {
    url = new URL(hook.target_url);
  } catch {
    await markFailed(client, delivery, "Invalid webhook URL", true, null, null);
    return { action: "complete", detail: { reason: "invalid_url" } };
  }
  if (url.protocol !== "https:") {
    await markFailed(client, delivery, "Outgoing webhook URL must use HTTPS", true, null, null);
    return { action: "complete", detail: { reason: "https_required" } };
  }

  const body = JSON.stringify({
    id: delivery.id,
    event: delivery.event_type,
    event_id: delivery.event_id,
    created_at: delivery.created_at,
    data: delivery.payload,
  });
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "AzWA-Webhooks/1.0",
    "x-azwa-event": delivery.event_type,
    "x-azwa-delivery": delivery.id,
  };
  if (hook.secret_reference) {
    const { data: secret, error: secretError } = await client.rpc("backend_decrypt_secret_reference", { p_secret_reference: hook.secret_reference });
    if (secretError || !secret) {
      await markFailed(client, delivery, "Unable to resolve outgoing webhook secret", true, null, null);
      return { action: "complete", detail: { reason: "secret_resolution_failed" } };
    }
    headers["x-azwa-signature"] = `sha256=${await hmacSha256Hex(String(secret), new TextEncoder().encode(body))}`;
  }

  await client.from("outgoing_webhook_deliveries").update({ status: "sending", attempt: Number(delivery.attempt ?? 0) + 1 }).eq("id", delivery.id);
  try {
    const response = await fetch(url, { method: "POST", headers, body });
    const responseText = await response.text().catch(() => "");
    if (response.ok) {
      await client.from("outgoing_webhook_deliveries").update({
        status: "delivered",
        http_status: response.status,
        response_excerpt: responseText.slice(0, 2000),
        delivered_at: new Date().toISOString(),
        next_retry_at: null,
      }).eq("id", delivery.id);
      return { action: "complete", detail: { status: response.status } };
    }

    const retryable = response.status === 429 || response.status >= 500;
    const final = !retryable || jobAttempt >= maxAttempts;
    const message = `Outgoing webhook returned HTTP ${response.status}`;
    await markFailed(client, delivery, message, final, response.status, responseText);
    return final
      ? { action: "complete", detail: { failed: true, status: response.status } }
      : { action: "retry", error: message, retryAfterSeconds: retryDelay(jobAttempt + 1) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const final = jobAttempt >= maxAttempts;
    await markFailed(client, delivery, message, final, null, null);
    return final
      ? { action: "complete", detail: { failed: true, error: message } }
      : { action: "retry", error: message, retryAfterSeconds: retryDelay(jobAttempt + 1) };
  }
}

async function markFailed(client: SupabaseClient, delivery: any, message: string, final: boolean, httpStatus: number | null, excerpt: string | null): Promise<void> {
  await client.from("outgoing_webhook_deliveries").update({
    status: final ? "failed" : "queued",
    http_status: httpStatus,
    response_excerpt: excerpt?.slice(0, 2000) ?? message.slice(0, 2000),
    next_retry_at: final ? null : new Date(Date.now() + 30_000).toISOString(),
  }).eq("id", delivery.id);
}

function retryDelay(attempt: number): number {
  const schedule = [10, 30, 120, 600, 1800, 3600];
  return schedule[Math.min(Math.max(attempt - 1, 0), schedule.length - 1)];
}
