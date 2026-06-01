// Send a WhatsApp message via Meta Cloud API.
// Authenticated. Body: { wa_number_id, to, type: 'text'|'template', text?, template? }

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
  const { wa_number_id, to, type = "text", text, template } = body;
  if (!wa_number_id || !to) {
    return new Response(JSON.stringify({ error: "wa_number_id and to required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Look up number + verify membership
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
  let waPayload: any;
  if (type === "template") {
    waPayload = {
      messaging_product: "whatsapp", to: toPhone, type: "template",
      template: template ?? { name: "hello_world", language: { code: "en_US" } },
    };
  } else {
    waPayload = {
      messaging_product: "whatsapp", to: toPhone, type: "text",
      text: { body: String(text ?? ""), preview_url: false },
    };
  }

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

  // Upsert contact + conversation
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
  await admin.from("messages").insert({
    tenant_id: num.tenant_id, conversation_id: conv!.id,
    direction: "outbound", status: "sent",
    type, text: type === "text" ? String(text ?? "") : null,
    provider_message_id: wamId, chat_id: toPhone,
    timestamp: new Date().toISOString(), sent_at: new Date().toISOString(),
    raw_payload: waPayload,
  });

  return new Response(JSON.stringify({ success: true, message_id: wamId, wa: waJson }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
