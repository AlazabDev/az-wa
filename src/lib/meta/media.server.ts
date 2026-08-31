/**
 * WhatsApp media handler — server only.
 *
 * Every inbound media item from every connected WhatsApp number is pulled from
 * Meta immediately, archived in the private MinIO bucket, and tracked in the
 * media/media_download_attempts tables.
 *
 * Object layout:
 *   <year>/<month>/<folder>/<media-id>.<extension>
 *
 * Examples:
 *   2026/8/img/<uuid>.jpg
 *   2026/8/pdf/<uuid>.pdf
 *   2026/9/pdf/<uuid>.pdf
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { putMinioObject } from "@/lib/storage/minio.server";

import { GRAPH_BASE, resolveCredential } from "./graph.server";

const MEDIA_QUEUE = "media-downloads";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "video/quicktime": "mov",
  "video/mpeg": "mpeg",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/amr": "amr",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/json": "json",
  "application/xml": "xml",
  "text/xml": "xml",
  "application/zip": "zip",
  "application/x-rar-compressed": "rar",
  "application/vnd.rar": "rar",
  "application/x-7z-compressed": "7z",
};

function cleanExtension(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase().replace(/^\./, "") ?? "";
  return /^[a-z0-9]{1,10}$/.test(normalized) ? normalized : null;
}

function extensionFor(mime: string | null, filename: string | null) {
  const fromName = filename?.includes(".") ? filename.split(".").pop() : null;
  return cleanExtension(fromName) ?? (mime ? EXTENSIONS[mime.toLowerCase()] : null) ?? "bin";
}

function folderFor(mime: string | null, extension: string) {
  if (mime?.toLowerCase().startsWith("image/")) return "img";
  return extension;
}

function storagePath(input: {
  timestamp: string | null;
  mediaId: string;
  mime: string | null;
  filename: string | null;
}) {
  const date = input.timestamp ? new Date(input.timestamp) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const extension = extensionFor(input.mime, input.filename);
  const folder = folderFor(input.mime, extension);
  const year = safeDate.getUTCFullYear();
  const month = safeDate.getUTCMonth() + 1;

  return {
    extension,
    folder,
    key: `${year}/${month}/${folder}/${input.mediaId}.${extension}`,
  };
}

function objectMetadata(metadata: Json | null): Record<string, Json | undefined> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  return metadata as Record<string, Json | undefined>;
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
      "id, organization_id, whatsapp_number_id, meta_media_id, media_type, mime_type, filename, received_at, created_at, download_status, download_attempts, storage_path, metadata",
    )
    .eq("id", mediaRowId)
    .maybeSingle();

  if (!media) {
    return {
      mediaId: mediaRowId,
      status: "failed",
      error: "media row not found",
    };
  }
  if (media.download_status === "downloaded" && media.storage_path) {
    return {
      mediaId: media.id,
      status: "skipped",
      storagePath: media.storage_path,
    };
  }
  if (!media.meta_media_id) {
    return {
      mediaId: media.id,
      status: "failed",
      error: "missing meta_media_id",
    };
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

  const cred = await resolveCredential({
    whatsappNumberId: media.whatsapp_number_id,
  });
  if (!cred.token) {
    return fail("no active Meta access token for this number", null);
  }

  // Resolve Meta's short-lived authenticated download URL.
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
    return fail(
      meta?.error?.message ?? `media lookup failed (HTTP ${metaRes.status})`,
      metaRes.status,
    );
  }

  // The Meta CDN URL still requires the bearer token.
  const binRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${cred.token}` },
  });
  if (!binRes.ok) {
    return fail(`binary download failed (HTTP ${binRes.status})`, binRes.status);
  }

  const bytes = new Uint8Array(await binRes.arrayBuffer());
  const mime = meta.mime_type ?? media.mime_type ?? binRes.headers.get("content-type");
  const object = storagePath({
    timestamp: media.received_at ?? media.created_at,
    mediaId: media.id,
    mime,
    filename: media.filename,
  });

  let uploaded: Awaited<ReturnType<typeof putMinioObject>>;
  try {
    uploaded = await putMinioObject({
      key: object.key,
      body: bytes,
      contentType: mime ?? "application/octet-stream",
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "MinIO upload failed", null);
  }

  const currentMetadata = objectMetadata(media.metadata);

  await supabaseAdmin
    .from("media")
    .update({
      download_status: "downloaded",
      storage_provider: "minio",
      storage_bucket: uploaded.bucket,
      storage_path: uploaded.key,
      mime_type: mime ?? null,
      file_size: meta.file_size ?? bytes.byteLength,
      sha256: meta.sha256 ?? null,
      stored_at: new Date().toISOString(),
      last_error: null,
      metadata: {
        ...currentMetadata,
        archive_folder: object.folder,
        archive_extension: object.extension,
        minio_etag: uploaded.etag,
      },
    })
    .eq("id", media.id);

  await logAttempt(
    media.organization_id,
    media.id,
    attemptNo,
    "stored",
    uploaded.status,
    null,
    startedAt,
  );

  return {
    mediaId: media.id,
    status: "downloaded",
    storagePath: uploaded.key,
  };
}

/**
 * Drains the media queue. The central webhook calls this immediately whenever
 * any connected account receives image/video/audio/document/sticker media.
 * The cron worker remains a retry safety net.
 */
export async function drainMediaQueue(limit = 50) {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "unexpected error";
      results.push({
        mediaId: payload.media_id,
        status: "failed",
        error: message,
      });
      await supabaseAdmin.rpc("backend_fail_job", {
        p_job_id: job.id,
        p_error: message,
        p_retry_after_seconds: 60,
      });
    }
  }

  return results;
}
