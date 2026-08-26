/**
 * Central Meta WhatsApp Webhook Gateway.
 * One endpoint for every WABA and every phone number. The number is identified
 * from `metadata.phone_number_id` — never from a per-number endpoint.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

type Change = {
  field?: string;
  value?: {
    metadata?: { phone_number_id?: string; display_phone_number?: string };
    messages?: Array<Record<string, unknown>>;
    statuses?: Array<Record<string, unknown>>;
  };
};

function validSignature(raw: string, header: string | null, secret: string | undefined) {
  if (!secret || !header) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/webhooks/meta/whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        const expected = process.env["META_WEBHOOK_VERIFY_TOKEN"];
        if (mode === "subscribe" && expected && token === expected) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        const signatureOk = validSignature(
          raw,
          request.headers.get("x-hub-signature-256"),
          process.env["META_APP_SECRET"],
        );

        let payload: { entry?: Array<{ id?: string; changes?: Change[] }> };
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Bad Request", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        for (const entry of payload.entry ?? []) {
          for (const change of entry.changes ?? []) {
            const metaPhoneId = change.value?.metadata?.phone_number_id ?? null;
            const metaWabaId = entry.id ?? null;

            const { data: number } = metaPhoneId
              ? await supabaseAdmin
                  .from("whatsapp_numbers")
                  .select("id, waba_id, business_portfolio_id")
                  .eq("meta_phone_number_id", metaPhoneId)
                  .maybeSingle()
              : { data: null };

            const messageId =
              (change.value?.messages?.[0]?.["id"] as string | undefined) ??
              (change.value?.statuses?.[0]?.["id"] as string | undefined) ??
              null;
            const statusName = change.value?.statuses?.[0]?.["status"] as string | undefined;
            const dedupKey = [metaPhoneId, messageId, statusName ?? "event", change.field].join(":");

            const { data: event } = await supabaseAdmin
              .from("webhook_events")
              .upsert(
                {
                  business_portfolio_id: number?.business_portfolio_id ?? null,
                  waba_id: number?.waba_id ?? null,
                  whatsapp_number_id: number?.id ?? null,
                  meta_waba_id: metaWabaId,
                  meta_phone_number_id: metaPhoneId,
                  event_type: change.field ?? "unknown",
                  message_id: messageId,
                  payload: change as unknown as Record<string, unknown>,
                  signature_valid: signatureOk,
                  deduplication_key: dedupKey,
                  status: number ? "queued" : "unmapped",
                  queued_at: new Date().toISOString(),
                },
                { onConflict: "deduplication_key", ignoreDuplicates: true },
              )
              .select("id")
              .maybeSingle();

            if (!number && metaPhoneId) {
              const { data: existing } = await supabaseAdmin
                .from("unmapped_number_events")
                .select("id, occurrences")
                .eq("meta_phone_number_id", metaPhoneId)
                .eq("resolved", false)
                .maybeSingle();
              if (existing) {
                await supabaseAdmin
                  .from("unmapped_number_events")
                  .update({
                    occurrences: existing.occurrences + 1,
                    last_seen_at: new Date().toISOString(),
                  })
                  .eq("id", existing.id);
              } else {
                await supabaseAdmin.from("unmapped_number_events").insert({
                  meta_phone_number_id: metaPhoneId,
                  meta_waba_id: metaWabaId,
                  display_phone_number: change.value?.metadata?.display_phone_number ?? null,
                  payload: change as unknown as Record<string, unknown>,
                });
                await supabaseAdmin.from("alerts").insert({
                  type: "unknown_phone_number",
                  severity: "critical",
                  title: "Unknown WhatsApp Phone Number",
                  description: `Webhook received for unmapped phone_number_id ${metaPhoneId}`,
                  metadata: { meta_phone_number_id: metaPhoneId, meta_waba_id: metaWabaId },
                });
              }
              continue;
            }

            if (event) {
              await supabaseAdmin.from("jobs").insert({
                queue: "webhook-events",
                type: change.field ?? "unknown",
                payload: { webhook_event_id: event.id },
                idempotency_key: `webhook-event:${event.id}`,
              });
            }
          }
        }

        // Always 200 quickly; processing happens asynchronously from the queue.
        return new Response("ok", { status: 200 });
      },
    },
  },
});
