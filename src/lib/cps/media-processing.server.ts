import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { getMinioObject } from "@/lib/storage/minio.server";

export const CPS_MEDIA_QUEUE = "cps-media-processing";

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/bmp",
  "image/tiff",
]);

function optionalEnv(name: string): string | undefined {
  const value = Reflect.get(process.env, name) as string | undefined;
  return value?.trim() || undefined;
}

function objectMetadata(metadata: Json | null): Record<string, Json | undefined> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return metadata as Record<string, Json | undefined>;
}

function schemaForMime(mimeType: string | null): string | undefined {
  const mime = mimeType?.toLowerCase() ?? "";
  if (SUPPORTED_IMAGE_TYPES.has(mime)) {
    return optionalEnv("CPS_SCHEMA_IMAGE_ID") ?? optionalEnv("CPS_DEFAULT_SCHEMA_ID");
  }
  if (mime === "application/pdf") {
    return optionalEnv("CPS_SCHEMA_PDF_ID") ?? optionalEnv("CPS_DEFAULT_SCHEMA_ID");
  }
  return undefined;
}

function isSupportedMime(mimeType: string | null): boolean {
  const mime = mimeType?.toLowerCase() ?? "";
  return SUPPORTED_IMAGE_TYPES.has(mime) || mime === "application/pdf";
}

function cpsEndpoint(): string | undefined {
  const base = optionalEnv("CPS_API_BASE_URL");
  return base ? `${base.replace(/\/+$/, "")}/contentprocessor/submit` : undefined;
}

function cpsConfigured(): boolean {
  const hasEndpoint = Boolean(cpsEndpoint());
  const hasDefaultSchema = Boolean(optionalEnv("CPS_DEFAULT_SCHEMA_ID"));
  const hasPerTypeSchemas = Boolean(
    optionalEnv("CPS_SCHEMA_IMAGE_ID") && optionalEnv("CPS_SCHEMA_PDF_ID"),
  );
  return hasEndpoint && (hasDefaultSchema || hasPerTypeSchemas);
}

async function updateCpsMetadata(
  mediaId: string,
  metadata: Json | null,
  cps: Record<string, Json>,
): Promise<void> {
  const current = objectMetadata(metadata);
  await supabaseAdmin
    .from("media")
    .update({
      metadata: {
        ...current,
        cps,
      },
    })
    .eq("id", mediaId);
}

export async function enqueueCpsMediaJob(input: {
  organizationId: string;
  mediaId: string;
}): Promise<void> {
  // Archival must never depend on CPS configuration. Until CPS is connected,
  // WhatsApp media remains safely stored without generating dead-letter jobs.
  if (!cpsConfigured()) return;

  const { error } = await supabaseAdmin.from("jobs").insert({
    organization_id: input.organizationId,
    queue_name: CPS_MEDIA_QUEUE,
    job_type: "process_whatsapp_media_with_cps",
    deduplication_key: `cps-media:${input.mediaId}`,
    priority: 30,
    payload: { media_id: input.mediaId },
    status: "queued",
    max_attempts: 8,
  });

  // Existing queued/running/completed CPS work for the same media is idempotent.
  if (error && error.code !== "23505") throw new Error(error.message);

  // Start immediately after archival. The authenticated cron endpoint remains
  // the durable retry path if the CPS API is unavailable at receive time.
  void drainCpsMediaQueue(1).catch((workerError) =>
    console.error("[AzWA CPS] immediate media processing failed", workerError),
  );
}

export type CpsMediaResult = {
  mediaId: string;
  status: "submitted" | "skipped" | "failed";
  processId?: string;
  error?: string;
};

async function submitMediaToCps(mediaId: string): Promise<CpsMediaResult> {
  const { data: media, error: mediaError } = await supabaseAdmin
    .from("media")
    .select(
      "id, organization_id, message_id, mime_type, filename, file_size, download_status, storage_path, metadata",
    )
    .eq("id", mediaId)
    .maybeSingle();

  if (mediaError) return { mediaId, status: "failed", error: mediaError.message };
  if (!media) return { mediaId, status: "failed", error: "media row not found" };

  const current = objectMetadata(media.metadata);
  const existingCps = current.cps;
  if (existingCps && typeof existingCps === "object" && !Array.isArray(existingCps)) {
    const existing = existingCps as Record<string, Json | undefined>;
    if (existing.status === "submitted" && typeof existing.process_id === "string") {
      return {
        mediaId: media.id,
        status: "skipped",
        processId: existing.process_id,
      };
    }
  }

  if (media.download_status !== "downloaded" || !media.storage_path) {
    return { mediaId: media.id, status: "failed", error: "media is not stored yet" };
  }

  if (!isSupportedMime(media.mime_type)) {
    await updateCpsMetadata(media.id, media.metadata, {
      status: "unsupported",
      mime_type: media.mime_type ?? "unknown",
      updated_at: new Date().toISOString(),
    });
    return { mediaId: media.id, status: "skipped" };
  }

  const endpoint = cpsEndpoint();
  if (!endpoint) {
    return { mediaId: media.id, status: "failed", error: "CPS_API_BASE_URL is not configured" };
  }

  const schemaId = schemaForMime(media.mime_type);
  if (!schemaId) {
    return {
      mediaId: media.id,
      status: "failed",
      error: "No CPS schema configured for this media type",
    };
  }

  const maxFileSizeMb = Number.parseInt(optionalEnv("CPS_MAX_FILE_SIZE_MB") ?? "20", 10);
  const maxBytes = (Number.isFinite(maxFileSizeMb) ? Math.max(1, maxFileSizeMb) : 20) * 1024 * 1024;
  if (media.file_size && media.file_size > maxBytes) {
    await updateCpsMetadata(media.id, media.metadata, {
      status: "too_large",
      file_size: media.file_size,
      max_file_size_bytes: maxBytes,
      updated_at: new Date().toISOString(),
    });
    return { mediaId: media.id, status: "skipped" };
  }

  let stored: Awaited<ReturnType<typeof getMinioObject>>;
  try {
    stored = await getMinioObject(media.storage_path);
  } catch (error) {
    return {
      mediaId: media.id,
      status: "failed",
      error: error instanceof Error ? error.message : "MinIO read failed",
    };
  }

  const filename =
    media.filename ?? media.storage_path.split("/").filter(Boolean).pop() ?? `whatsapp-${media.id}`;
  const mimeType = media.mime_type ?? stored.contentType ?? "application/octet-stream";
  const metadataId = `whatsapp:${media.message_id ?? media.id}`;

  const form = new FormData();
  form.set("data", JSON.stringify({ Metadata_Id: metadataId, Schema_Id: schemaId }));
  form.set(
    "file",
    new Blob([Uint8Array.from(stored.bytes).buffer], { type: mimeType }),
    filename,
  );

  const headers: HeadersInit = {};
  const bearerToken = optionalEnv("CPS_API_BEARER_TOKEN");
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: form,
    });
  } catch (error) {
    return {
      mediaId: media.id,
      status: "failed",
      error: error instanceof Error ? error.message : "CPS request failed",
    };
  }

  const rawBody = await response.text().catch(() => "");
  let body: { process_id?: string; message?: string } | null = null;
  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as { process_id?: string; message?: string };
    } catch {
      body = null;
    }
  }

  if (response.status !== 202 || !body?.process_id) {
    const detail = body?.message ?? rawBody;
    return {
      mediaId: media.id,
      status: "failed",
      error: `CPS submit failed (HTTP ${response.status})${detail ? `: ${detail.slice(0, 500)}` : ""}`,
    };
  }

  await updateCpsMetadata(media.id, media.metadata, {
    status: "submitted",
    process_id: body.process_id,
    schema_id: schemaId,
    metadata_id: metadataId,
    submitted_at: new Date().toISOString(),
  });

  return {
    mediaId: media.id,
    status: "submitted",
    processId: body.process_id,
  };
}

export async function drainCpsMediaQueue(limit = 20): Promise<CpsMediaResult[]> {
  // Do not claim jobs until the CPS connection is complete. This keeps queued
  // work intact during deployment/configuration changes.
  if (!cpsConfigured()) return [];

  const { data: jobs, error } = await supabaseAdmin.rpc("backend_claim_jobs", {
    p_worker_id: `cps-media-worker-${crypto.randomUUID().slice(0, 8)}`,
    p_queue_names: [CPS_MEDIA_QUEUE],
    p_limit: limit,
  });
  if (error) throw new Error(error.message);

  const results: CpsMediaResult[] = [];
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
      const result = await submitMediaToCps(payload.media_id);
      results.push(result);
      if (result.status === "failed") {
        await supabaseAdmin.rpc("backend_fail_job", {
          p_job_id: job.id,
          p_error: result.error ?? "CPS processing failed",
          p_retry_after_seconds: Math.min(300, 15 * job.attempt),
        });
      } else {
        await supabaseAdmin.rpc("backend_complete_job", { p_job_id: job.id });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unexpected CPS worker error";
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
