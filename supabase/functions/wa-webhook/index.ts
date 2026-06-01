// Meta WhatsApp Cloud webhook receiver
// Public endpoint - verifies signature via WA_APP_SECRET, ingests messages,
// upserts conversations/contacts/messages, then fan-outs to hub_dispatch_targets.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFY_TOKEN = Deno.env.get("WA_WEBHOOK_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("WA_APP_SECRET") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function verifySignature(rawBody: string, signature: string | null) {
  if (!APP_SECRET || !signature) return true; // skip when not configured
  const sig = signature.replace("sha256=", "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return expected === sig;
}

async function findTenantByPhoneNumberId(phoneNumberId: string) {
  const { data } = await admin
    .from("wa_numbers")
    .select("id,tenant_id,phone_e164,display_phone_number")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  return data;
}

async function upsertContact(tenantId: string, waId: string, name?: string) {
  const phone = waId.startsWith("+") ? waId : `+${waId}`;
  const { data: existing } = await admin
    .from("contacts").select("id").eq("tenant_id", tenantId).eq("phone_e164", phone).maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await admin.from("contacts")
    .insert({ tenant_id: tenantId, phone_e164: phone, wa_id: waId, display_name: name ?? phone })
    .select("id").single();
  return created!.id;
}

async function getOrCreateConversation(tenantId: string, waNumberId: string, contactId: string) {
  const { data: existing } = await admin.from("conversations")
    .select("id").eq("tenant_id", tenantId).eq("wa_number_id", waNumberId)
    .eq("contact_id", contactId).maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await admin.from("conversations")
    .insert({ tenant_id: tenantId, wa_number_id: waNumberId, contact_id: contactId, status: "open" })
    .select("id").single();
  return created!.id;
}

async function dispatchToTargets(tenantId: string, eventType: string, payload: unknown, waNumberId: string) {
  const { data: targets } = await admin.from("hub_dispatch_targets")
    .select("id,url,secret,events_filter,numbers_filter,timeout_ms")
    .eq("tenant_id", tenantId).eq("is_active", true);
  if (!targets?.length) return;

  for (const t of targets) {
    const events = (t.events_filter as string[]) ?? [];
    const numbers = (t.numbers_filter as string[]) ?? [];
    if (events.length && !events.includes(eventType)) continue;
    if (numbers.length && !numbers.includes(waNumberId)) continue;

    const body = JSON.stringify({ event: eventType, timestamp: new Date().toISOString(), data: payload });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (t.secret) {
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(t.secret),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
      headers["X-Webhook-Signature"] = "sha256=" + Array.from(new Uint8Array(mac))
        .map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    const startedAt = Date.now();
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), t.timeout_ms ?? 5000);
      const resp = await fetch(t.url, { method: "POST", headers, body, signal: ctl.signal });
      clearTimeout(timer);
      await admin.from("hub_deliveries").insert({
        tenant_id: tenantId, target_id: t.id, event_id: null,
        status: resp.ok ? "delivered" : "failed", http_status: resp.status,
        response_time_ms: Date.now() - startedAt, delivered_at: new Date().toISOString(),
      });
      await admin.from("hub_dispatch_targets").update({
        last_delivery_at: new Date().toISOString(),
        last_error: resp.ok ? null : `HTTP ${resp.status}`,
      }).eq("id", t.id);
    } catch (e) {
      await admin.from("hub_deliveries").insert({
        tenant_id: tenantId, target_id: t.id, status: "failed",
        error_message: (e as Error).message, response_time_ms: Date.now() - startedAt,
      });
      await admin.from("hub_dispatch_targets").update({
        last_error: (e as Error).message,
      }).eq("id", t.id);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);

  // GET: Meta verification handshake
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const sigOk = await verifySignature(rawBody, req.headers.get("x-hub-signature-256"));
  if (!sigOk) return new Response("Invalid signature", { status: 401 });

  let body: any;
  try { body = JSON.parse(rawBody); } catch { return new Response("Invalid JSON", { status: 400 }); }

  // Process entries
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const meta = value.metadata ?? {};
      const phoneNumberId = meta.phone_number_id;
      if (!phoneNumberId) continue;

      const waNum = await findTenantByPhoneNumberId(phoneNumberId);
      if (!waNum) {
        await admin.from("hub_events").insert({
          phone_number_id: phoneNumberId, event_type: "unmapped",
          payload: value, processed: false,
        });
        continue;
      }
      const tenantId = waNum.tenant_id;

      // Status updates
      for (const status of value.statuses ?? []) {
        const wamId = status.id;
        const ts = new Date(parseInt(status.timestamp) * 1000).toISOString();
        const updates: Record<string, unknown> = {};
        if (status.status === "sent") updates.sent_at = ts;
        if (status.status === "delivered") { updates.delivered_at = ts; updates.status = "delivered"; }
        if (status.status === "read") { updates.read_at = ts; updates.status = "read"; }
        if (status.status === "failed") { updates.failed_at = ts; updates.status = "failed"; updates.error_payload = status.errors ?? null; }
        if (Object.keys(updates).length) {
          await admin.from("messages").update(updates).eq("provider_message_id", wamId);
        }
        await admin.from("hub_events").insert({
          tenant_id: tenantId, phone_number_id: phoneNumberId,
          event_type: "status." + status.status, direction: "outbound",
          wam_id: wamId, payload: status, processed: true,
          processed_at: new Date().toISOString(),
        });
        await dispatchToTargets(tenantId, "status." + status.status, status, waNum.id);
      }

      // Inbound messages
      const contactsMeta = value.contacts ?? [];
      for (const msg of value.messages ?? []) {
        const fromWaId = msg.from;
        const profileName = contactsMeta.find((c: any) => c.wa_id === fromWaId)?.profile?.name;
        const contactId = await upsertContact(tenantId, fromWaId, profileName);
        const conversationId = await getOrCreateConversation(tenantId, waNum.id, contactId);

        const text = msg.text?.body ?? msg.button?.text ?? msg.interactive?.button_reply?.title
          ?? msg.interactive?.list_reply?.title ?? null;

        await admin.from("messages").insert({
          tenant_id: tenantId, conversation_id: conversationId,
          direction: "inbound", status: "delivered",
          type: msg.type ?? "text", text,
          provider_message_id: msg.id, chat_id: fromWaId,
          timestamp: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
          delivered_at: new Date().toISOString(),
          is_received: true,
          interactive_payload: msg.interactive ?? null,
          media_wa_id: msg.image?.id ?? msg.video?.id ?? msg.audio?.id ?? msg.document?.id ?? null,
          media_mime: msg.image?.mime_type ?? msg.video?.mime_type ?? msg.audio?.mime_type ?? msg.document?.mime_type ?? null,
          media_filename: msg.document?.filename ?? null,
          raw_payload: msg,
        });
        await admin.from("contacts").update({
          last_message_received_at: new Date().toISOString(),
        }).eq("id", contactId);

        await admin.from("hub_events").insert({
          tenant_id: tenantId, phone_number_id: phoneNumberId,
          event_type: "message.received", direction: "inbound",
          wam_id: msg.id, from_phone: fromWaId, to_phone: meta.display_phone_number,
          payload: msg, processed: true, processed_at: new Date().toISOString(),
        });
        await dispatchToTargets(tenantId, "message.received", { message: msg, contact: { wa_id: fromWaId, name: profileName } }, waNum.id);
      }
    }
  }

  return new Response("ok", { status: 200, headers: corsHeaders });
});
