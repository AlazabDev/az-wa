// Ingest finance documents into the Milano (MinIO) bucket + queue them for the agent.
// Authenticated. Body:
//   { batch_id?, batch_name?, files: [{ file_name, mime, data_base64 }] }
//   or { batch_id?, media_wa_ids: ["..."] }   (already received on the finance number)

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { minioPut, minioConfigured, MINIO_BUCKET } from "../_shared/minio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PREFIX = Deno.env.get("FINANCE_STORAGE_PREFIX") ?? "finance";
const FINANCE_PHONE_ID = Deno.env.get("WA_FINANCE_PHONE_NUMBER_ID") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function b64ToBytes(b64: string) {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(bytes: Uint8Array) {
  const buf = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const supabase = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
  const userId = claims?.claims?.sub;
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const { data: membership } = await admin.from("tenant_members")
    .select("tenant_id, role").eq("user_id", userId).limit(1).maybeSingle();
  if (!membership) return json({ error: "No tenant" }, 403);
  const tenantId = membership.tenant_id;

  if (!minioConfigured()) return json({ error: "MinIO (Milano) not configured" }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  // Resolve the finance number
  const { data: waNumber } = await admin.from("wa_numbers")
    .select("id").eq("phone_number_id", FINANCE_PHONE_ID).maybeSingle();

  // Resolve / create batch
  let batchId: string | null = body.batch_id ?? null;
  if (!batchId) {
    const { data: batch, error } = await admin.from("finance_batches").insert({
      tenant_id: tenantId,
      name: body.batch_name ?? `دفعة ${new Date().toLocaleDateString("ar-EG")}`,
      source_phone: body.source_phone ?? null,
    }).select("id").single();
    if (error) return json({ error: error.message }, 500);
    batchId = batch.id;
  }

  const created: string[] = [];
  const skipped: string[] = [];
  const failed: { name: string; error: string }[] = [];

  for (const file of (body.files ?? []).slice(0, 50)) {
    try {
      const bytes = b64ToBytes(file.data_base64);
      if (!bytes.length) throw new Error("ملف فارغ");
      const hash = await sha256Hex(bytes);

      const { data: dupe } = await admin.from("finance_documents")
        .select("id").eq("tenant_id", tenantId).eq("sha256", hash).maybeSingle();
      if (dupe) { skipped.push(file.file_name); continue; }

      const ext = (file.file_name?.split(".").pop() ?? "jpg").toLowerCase().slice(0, 5);
      const key = `${PREFIX}/${tenantId}/${hash}.${ext}`;
      await minioPut(key, bytes, file.mime ?? "image/jpeg");

      const { data: doc, error } = await admin.from("finance_documents").insert({
        tenant_id: tenantId,
        batch_id: batchId,
        wa_number_id: waNumber?.id ?? null,
        file_name: file.file_name ?? key,
        mime: file.mime ?? "image/jpeg",
        size_bytes: bytes.length,
        sha256: hash,
        storage_provider: "minio",
        storage_bucket: MINIO_BUCKET,
        object_key: key,
        status: "pending",
      }).select("id").single();
      if (error) throw new Error(error.message);
      created.push(doc.id);
    } catch (e) {
      failed.push({ name: file.file_name ?? "?", error: (e as Error).message });
    }
  }

  // Attach already-received WhatsApp media to this batch
  for (const mediaId of (body.media_wa_ids ?? []).slice(0, 200)) {
    const { data: doc } = await admin.from("finance_documents")
      .update({ batch_id: batchId }).eq("tenant_id", tenantId).eq("media_wa_id", mediaId)
      .select("id").maybeSingle();
    if (doc) created.push(doc.id); else skipped.push(mediaId);
  }

  await admin.from("finance_batches").update({
    total_documents: (await admin.from("finance_documents")
      .select("id", { count: "exact", head: true }).eq("batch_id", batchId)).count ?? 0,
  }).eq("id", batchId);

  return json({ success: true, batch_id: batchId, created: created.length, skipped: skipped.length, failed });
});
