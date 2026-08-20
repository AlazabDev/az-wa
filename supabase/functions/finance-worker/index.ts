// Finance media worker: bounded batch, single-flight lease, idempotent progress,
// circuit breaker on 402/403 and repeated 429s.
// Called by the app ("معالجة الدفعة") or by a scheduler with the service-role key.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { minioGet, minioPut, minioConfigured, MINIO_BUCKET } from "../_shared/minio.ts";
import { analyzeImage, visionConfigured } from "../_shared/vision.ts";
import { extractFinanceData } from "../_shared/foundry.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WA_TOKEN = Deno.env.get("WA_FINANCE_TOKEN") ?? Deno.env.get("WA_ACCESS_TOKEN") ?? "";
const WA_VERSION = Deno.env.get("WA_API_VERSION") ?? "v21.0";
const PREFIX = Deno.env.get("FINANCE_STORAGE_PREFIX") ?? "finance";
const PIPELINE_ENABLED = (Deno.env.get("FINANCE_PIPELINE_ENABLED") ?? "true") !== "false";
const WORKER_ID = "finance-media-worker";
const LEASE_SECONDS = 300;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sha256Hex(bytes: Uint8Array) {
  const buf = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function downloadWaMedia(mediaId: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const metaRes = await fetch(`https://graph.facebook.com/${WA_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${WA_TOKEN}` },
  });
  if (!metaRes.ok) throw new Error(`WA media meta ${metaRes.status}`);
  const meta = await metaRes.json();
  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
  if (!fileRes.ok) throw new Error(`WA media download ${fileRes.status}`);
  return { bytes: new Uint8Array(await fileRes.arrayBuffer()), mime: meta.mime_type ?? "image/jpeg" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Auth: signed-in app user OR service-role key (scheduler)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized" }, 401);
  if (token !== SERVICE_KEY) {
    const supabase = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await supabase.auth.getClaims(token);
    if (!claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const resume = body.resume === true;
  const limit = Math.min(Math.max(Number(body.limit ?? 5), 1), 20);

  if (!PIPELINE_ENABLED) return json({ skipped: true, reason: "FINANCE_PIPELINE_ENABLED=false" });
  if (!minioConfigured()) return json({ error: "MinIO (Milano) not configured" }, 500);
  if (!visionConfigured()) return json({ error: "Azure Vision not configured" }, 500);

  // Worker state: paused guard + single-flight lease
  const { data: state } = await admin.from("finance_worker_state").select("*").eq("id", WORKER_ID).maybeSingle();
  if (resume && state?.is_paused) {
    await admin.from("finance_worker_state").update({ is_paused: false, paused_reason: null }).eq("id", WORKER_ID);
  }
  let probeOnly = false;
  if (state?.is_paused && !resume) probeOnly = true; // single probe item to detect recovery

  const now = Date.now();
  if (state?.lease_until && new Date(state.lease_until).getTime() > now) {
    return json({ skipped: true, reason: "another run in progress", lease_until: state.lease_until });
  }
  const leaseUntil = new Date(now + LEASE_SECONDS * 1000).toISOString();
  const { data: leased } = await admin.from("finance_worker_state")
    .update({ lease_until: leaseUntil, last_run_at: new Date().toISOString() })
    .eq("id", WORKER_ID)
    .or(`lease_until.is.null,lease_until.lt.${new Date(now).toISOString()}`)
    .select("id").maybeSingle();
  if (!leased) return json({ skipped: true, reason: "lease not acquired" });

  const results: any[] = [];
  let paused: string | null = null;
  let rateLimited = 0;

  try {
    const { data: docs, error } = await admin.rpc("claim_finance_documents", {
      _limit: probeOnly ? 1 : limit,
      _lease_seconds: LEASE_SECONDS,
    });
    if (error) throw new Error(error.message);

    for (const doc of docs ?? []) {
      try {
        // 1) Bytes: Milano bucket first, otherwise fetch from WhatsApp and store it
        let bytes: Uint8Array;
        let mime = doc.mime ?? "image/jpeg";
        let objectKey = doc.object_key as string | null;

        if (objectKey) {
          bytes = await minioGet(objectKey);
        } else if (doc.media_wa_id) {
          const dl = await downloadWaMedia(doc.media_wa_id);
          bytes = dl.bytes; mime = dl.mime;
          const hash = await sha256Hex(bytes);
          const ext = (mime.split("/")[1] ?? "jpg").split(";")[0];
          objectKey = `${PREFIX}/${doc.tenant_id}/${hash}.${ext}`;
          await minioPut(objectKey, bytes, mime);
          await admin.from("finance_documents").update({
            object_key: objectKey, storage_bucket: MINIO_BUCKET, mime,
            size_bytes: bytes.length, sha256: hash,
          }).eq("id", doc.id);
        } else {
          throw new Error("لا يوجد ملف مرتبط بالمستند");
        }

        // 2) Azure Vision OCR
        const vision = await analyzeImage(bytes, mime);

        // 3) Foundry finance agent
        const extraction = await extractFinanceData(vision.ocrText, vision.tags);

        await admin.from("finance_documents").update({
          status: "done",
          ocr_text: vision.ocrText,
          vision_result: { caption: vision.caption, tags: vision.tags },
          agent_result: extraction as unknown as Record<string, unknown>,
          doc_type: extraction.doc_type,
          vendor: extraction.vendor,
          invoice_number: extraction.invoice_number,
          invoice_date: extraction.invoice_date,
          currency: extraction.currency,
          total_amount: extraction.total_amount,
          tax_amount: extraction.tax_amount,
          confidence: extraction.confidence,
          error_message: null,
          processed_at: new Date().toISOString(),
        }).eq("id", doc.id);

        results.push({ id: doc.id, status: "done", provider: extraction.provider });

        if (probeOnly) {
          await admin.from("finance_worker_state")
            .update({ is_paused: false, paused_reason: null }).eq("id", WORKER_ID);
        }
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        const status = (e as any).status ?? (msg.match(/\b(402|403|429)\b/)?.[1] ? Number(msg.match(/\b(402|403|429)\b/)![1]) : 0);
        if (status === 402 || status === 403) paused = msg;
        if (status === 429) rateLimited++;

        await admin.from("finance_documents").update({
          status: doc.attempts >= 3 ? "failed" : "pending",
          error_message: msg.slice(0, 500),
        }).eq("id", doc.id);
        results.push({ id: doc.id, status: "error", error: msg.slice(0, 200) });
        if (paused) break;
      }
    }

    // Roll up batch counters
    const batchIds = [...new Set((docs ?? []).map((d: any) => d.batch_id).filter(Boolean))];
    for (const bId of batchIds) {
      const [{ count: total }, { count: done }, { count: failedCount }] = await Promise.all([
        admin.from("finance_documents").select("id", { count: "exact", head: true }).eq("batch_id", bId),
        admin.from("finance_documents").select("id", { count: "exact", head: true }).eq("batch_id", bId).eq("status", "done"),
        admin.from("finance_documents").select("id", { count: "exact", head: true }).eq("batch_id", bId).eq("status", "failed"),
      ]);
      const { data: sums } = await admin.from("finance_documents")
        .select("total_amount, currency").eq("batch_id", bId).eq("status", "done");
      const totalAmount = (sums ?? []).reduce((s: number, r: any) => s + (Number(r.total_amount) || 0), 0);
      await admin.from("finance_batches").update({
        total_documents: total ?? 0,
        processed_documents: done ?? 0,
        failed_documents: failedCount ?? 0,
        total_amount: totalAmount,
        currency: (sums ?? [])[0]?.currency ?? null,
        status: (done ?? 0) + (failedCount ?? 0) >= (total ?? 0) ? "completed" : "processing",
      }).eq("id", bId);
    }

    if (paused || rateLimited >= 3) {
      await admin.from("finance_worker_state").update({
        is_paused: true,
        paused_reason: paused ?? "تم تجاوز حد المعدل مراراً — سيُعاد المحاولة لاحقاً",
      }).eq("id", WORKER_ID);
    }

    const { count: remaining } = await admin.from("finance_documents")
      .select("id", { count: "exact", head: true }).eq("status", "pending");

    return json({
      success: true,
      processed: results.length,
      remaining: remaining ?? 0,
      paused: Boolean(paused) || rateLimited >= 3,
      paused_reason: paused,
      results,
    });
  } catch (e) {
    await admin.from("finance_worker_state").update({ last_error: (e as Error).message }).eq("id", WORKER_ID);
    return json({ error: (e as Error).message }, 500);
  } finally {
    await admin.from("finance_worker_state").update({ lease_until: null }).eq("id", WORKER_ID);
  }
});
