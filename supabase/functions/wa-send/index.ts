// Send a WhatsApp message via Meta Cloud API.
// Authenticated. Body: {
//   wa_number_id, to,
//   type: 'text'|'template'|'image'|'video'|'audio'|'document'|'sticker'|'reaction',
//   text?, template?, media?: { link, caption?, filename? },
//   reaction?: { message_id, emoji },
//   context?: { message_id }  // reply-to (provider_message_id)
// }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WA_TOKEN = Deno.env.get("WA_ACCESS_TOKEN") ?? Deno.env.get("WA_TOKEN") ?? "";
const WA_VERSION = Deno.env.get("WA_API_VERSION") ?? "v21.0";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MEDIA_TYPES = new Set(["image", "video", "audio", "document", "sticker"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (claimsErr || !claims?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = claims.claims.sub;

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }
  const { wa_number_id, to, type = "text", text, template, media, reaction, context } = body;
  if (!wa_number_id || !to) {
    return new Response(JSON.stringify({ error: "wa_number_id and to required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: num } = await admin.from("wa_numbers")
    .select("id,phone_number_id,tenant_id").eq("id", wa_number_id).maybeSingle();
  if (!num) {
    return new Response(JSON.stringify({ error: "Number not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: member } = await admin.from("tenant_members")
    .select("role").eq("tenant_id", num.tenant_id).eq("user_id", userId).maybeSingle();
  if (!member) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const toPhone = String(to).replace(/[^0-9]/g, "");
  let waPayload: any = { messaging_product: "whatsapp", to: toPhone, type };

  if (type === "text") {
    waPayload.text = { body: String(text ?? ""), preview_url: true };
  } else if (type === "template") {
    waPayload.template = template ?? { name: "hello_world", language: { code: "en_US" } };
  } else if (type === "reaction") {
    waPayload.reaction = { message_id: reaction?.message_id, emoji: reaction?.emoji ?? "" };
  } else if (MEDIA_TYPES.has(type)) {
    const m: any = { link: media?.link };
    if (media?.caption && type !== "audio" && type !== "sticker") m.caption = media.caption;
    if (type === "document" && media?.filename) m.filename = media.filename;
    waPayload[type] = m;
  } else {
    return new Response(JSON.stringify({ error: "Unsupported type" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (context?.message_id) waPayload.context = { message_id: context.message_id };

  const waResp = await fetch(`https://graph.facebook.com/${WA_VERSION}/${num.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(waPayload),
  });
  const waJson = await waResp.json();

  if (!waResp.ok) {
    return new Response(JSON.stringify({ error: "WA API error", details: waJson }), {
      status: waResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const phoneE164 = "+" + toPhone;
  let { data: contact } = await admin.from("contacts")
    .select("id").eq("tenant_id", num.tenant_id).eq("phone_e164", phoneE164).maybeSingle();
  if (!contact) {
    const ins = await admin.from("contacts")
      .insert({ tenant_id: num.tenant_id, phone_e164: phoneE164, wa_id: toPhone, display_name: phoneE164 })
      .select("id").single();
    contact = ins.data!;
  }
  let { data: conv } = await admin.from("conversations")
    .select("id").eq("tenant_id", num.tenant_id).eq("wa_number_id", num.id)
    .eq("contact_id", contact!.id).maybeSingle();
  if (!conv) {
    const ins = await admin.from("conversations")
      .insert({ tenant_id: num.tenant_id, wa_number_id: num.id, contact_id: contact!.id, status: "open" })
      .select("id").single();
    conv = ins.data!;
  }

  const wamId = waJson.messages?.[0]?.id;
  const textValue =
    type === "text" ? String(text ?? "")
    : type === "reaction" ? (reaction?.emoji ?? "")
    : (media?.caption ?? null);

  await admin.from("messages").insert({
    tenant_id: num.tenant_id, conversation_id: conv!.id,
    direction: "outbound", status: "sent",
    type, text: textValue,
    provider_message_id: wamId, chat_id: toPhone,
    timestamp: new Date().toISOString(), sent_at: new Date().toISOString(),
    media_filename: media?.filename ?? null,
    raw_payload: waPayload,
  });

  return new Response(JSON.stringify({ success: true, message_id: wamId, wa: waJson }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
