/**
 * WhatsApp media handler — server only.
 * Pulls binaries from the Meta Graph API as soon as an inbound media message
 * arrives, stores them in the private `azwa-whatsapp-media` bucket and records
 * every attempt in `media_download_attempts`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { GRAPH_BASE, resolveCredential } from "./graph.server";

export const MEDIA_BUCKET = "azwa-whatsapp-media";
const MEDIA_QUEUE = "media-downloads";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/amr": "amr",
  "application/pdf": "pdf",
};

function extensionFor(mime: string | null, filename: string | null) {
  const fromName = filename?.includes(".") ? filename.split(".").pop() : null;
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  if (mime && EXTENSIONS[mime]) return EXTENSIONS[mime];
  return "bin";
}

async function logAttempt(
  organizationId: string,
  mediaId: string,
  attemptNo: number,
  status: "stored" | "failed",
  httpStatus: number | null,
  error: string | null,
  startedAt: string,
) {
  await supabaseAdmin.from("media_download_attempts").insert({
    organization_id: organizationId,
    media_id: mediaId,
    attempt_no: attemptNo,
    status,
    http_status: httpStatus,
    error,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  });
}

export type MediaDownloadResult = {
  mediaId: string;
  status: "downloaded" | "skipped" | "failed";
  storagePath?: string;
  error?: string;
};

/** Downloads one media row. Idempotent: already-stored rows are skipped. */
export async function downloadMedia(mediaRowId: string): Promise<MediaDownloadResult> {
  const startedAt = new Date().toISOString();
  const { data: media } = await supabaseAdmin
    .from("media")
    .select(
      "id, organization_id, whatsapp_number_id, meta_media_id, media_type, mime_type, filename, download_status, download_attempts, storage_path",
    )
    .eq("id", mediaRowId)
    .maybeSingle();

  if (!media) return { mediaId: mediaRowId, status: "failed", error: "media row not found" };
  if (media.download_status === "downloaded" && media.storage_path) {
    return { mediaId: media.id, status: "skipped", storagePath: media.storage_path };
  }
  if (!media.meta_media_id) {
    return { mediaId: media.id, status: "failed", error: "missing meta_media_id" };
  }

  const attemptNo = (media.download_attempts ?? 0) + 1;
  await supabaseAdmin
    .from("media")
    .update({ download_status: "downloading", download_attempts: attemptNo })
    .eq("id", media.id);

  const fail = async (message: string, httpStatus: number | null) => {
    await logAttempt(
      media.organization_id,
      media.id,
      attemptNo,
      "failed",
      httpStatus,
      message,
      startedAt,
    );
    await supabaseAdmin
      .from("media")
      .update({ download_status: "failed", last_error: message })
      .eq("id", media.id);
    return { mediaId: media.id, status: "failed" as const, error: message };
  };

  const cred = await resolveCredential({ whatsappNumberId: media.whatsapp_number_id });
  if (!cred.token) return fail("no active Meta access token for this number", null);

  // 1. Resolve the short-lived, authenticated download URL.
  const metaRes = await fetch(`${GRAPH_BASE}/${media.meta_media_id}`, {
    headers: { Authorization: `Bearer ${cred.token}` },
  });
  const meta = (await metaRes.json().catch(() => null)) as {
    url?: string;
    mime_type?: string;
    sha256?: string;
    file_size?: number;
    error?: { message?: string };
  } | null;
  if (!metaRes.ok || !meta?.url) {
    return fail(meta?.error?.message ?? `media lookup failed (HTTP ${metaRes.status})`, metaRes.status);
  }

  // 2. Fetch the binary (the CDN URL still requires the bearer token).
  const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${cred.token}` } });
  if (!binRes.ok) return fail(`binary download failed (HTTP ${binRes.status})`, binRes.status);
  const bytes = new Uint8Array(await binRes.arrayBuffer());

  const mime = meta.mime_type ?? media.mime_type ?? binRes.headers.get("content-type");
  const ext = extensionFor(mime, media.filename);
  const path = `${media.organization_id}/${media.whatsapp_number_id}/${media.id}.${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { contentType: mime ?? "application/octet-stream", upsert: true });
  if (uploadError) return fail(`storage upload failed: ${uploadError.message}`, null);

  await supabaseAdmin
    .from("media")
    .update({
      download_status: "downloaded",
      storage_provider: "supabase",
      storage_bucket: MEDIA_BUCKET,
      storage_path: path,
      mime_type: mime ?? null,
      file_size: meta.file_size ?? bytes.byteLength,
      sha256: meta.sha256 ?? null,
      stored_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", media.id);

  await logAttempt(
    media.organization_id,
    media.id,
    attemptNo,
    "stored",
    binRes.status,
    null,
    startedAt,
  );

  return { mediaId: media.id, status: "downloaded", storagePath: path };
}

/**
 * Drains the `media-downloads` queue. Called right after webhook ingestion for
 * instant pulls, and by the worker endpoint as a safety net for retries.
 */
export async function drainMediaQueue(limit = 10) {
  const { data: jobs, error } = await supabaseAdmin.rpc("backend_claim_jobs", {
    p_worker_id: `media-worker-${crypto.randomUUID().slice(0, 8)}`,
    p_queue_names: [MEDIA_QUEUE],
    p_limit: limit,
  });
  if (error) throw new Error(error.message);

  const results: MediaDownloadResult[] = [];
  for (const job of jobs ?? []) {
    const payload = (job.payload ?? {}) as { media_id?: string };
    if (!payload.media_id) {
      await supabaseAdmin.rpc("backend_fail_job", {
        p_job_id: job.id,
        p_error: "job payload is missing media_id",
        p_retry_after_seconds: 0,
      });
      continue;
    }
    try {
      const result = await downloadMedia(payload.media_id);
      results.push(result);
      if (result.status === "failed") {
        await supabaseAdmin.rpc("backend_fail_job", {
          p_job_id: job.id,
          p_error: result.error ?? "download failed",
          p_retry_after_seconds: Math.min(300, 15 * job.attempt),
        });
      } else {
        await supabaseAdmin.rpc("backend_complete_job", { p_job_id: job.id });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "unexpected error";
      results.push({ mediaId: payload.media_id, status: "failed", error: message });
      await supabaseAdmin.rpc("backend_fail_job", {
        p_job_id: job.id,
        p_error: message,
        p_retry_after_seconds: 60,
      });
    }
  }
  return results;
}
