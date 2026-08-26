import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { metaFetch, resolveMetaToken } from "./meta.ts";
import { projectUrl, serviceKey } from "./supabase.ts";
import type { MetaScope } from "./types.ts";

export interface MediaProcessResult {
  ok: boolean;
  retryable: boolean;
  error?: string;
  storagePath?: string;
}

export async function downloadWhatsappMedia(client: SupabaseClient, mediaId: string): Promise<MediaProcessResult> {
  const { data: media, error } = await client
    .from("media")
    .select("*,whatsapp_numbers!inner(id,waba_id,meta_phone_number_id,wabas!inner(business_portfolio_id))")
    .eq("id", mediaId)
    .single();
  if (error || !media) return { ok: false, retryable: false, error: "Media record not found" };
  if (media.download_status === "stored" && media.storage_path) return { ok: true, retryable: false, storagePath: media.storage_path };
  if (!media.meta_media_id) return { ok: false, retryable: false, error: "Missing Meta media id" };

  const attemptNo = Number(media.download_attempts ?? 0) + 1;
  const { data: attempt } = await client.from("media_download_attempts").insert({
    organization_id: media.organization_id,
    media_id: media.id,
    attempt_no: attemptNo,
    status: "started",
  }).select("id").single();

  await client.from("media").update({
    download_status: "downloading",
    download_attempts: attemptNo,
    last_error: null,
  }).eq("id", media.id);

  const number = media.whatsapp_numbers;
  const scope: MetaScope = {
    organizationId: media.organization_id,
    whatsappNumberId: number.id,
    wabaId: number.waba_id,
    businessPortfolioId: number.wabas.business_portfolio_id,
  };

  try {
    const meta: any = await metaFetch(client, scope, media.meta_media_id);
    if (!meta?.url || typeof meta.url !== "string") throw new Error("Meta media URL missing");
    const credential = await resolveMetaToken(client, scope);
    const response = await fetch(meta.url, { headers: { Authorization: `Bearer ${credential.token}` } });
    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => "");
      const err = `Media download failed (${response.status})${body ? `: ${body.slice(0,300)}` : ""}`;
      await markFailure(client, media, attempt?.id, err, response.status);
      return { ok: false, retryable: response.status === 429 || response.status >= 500, error: err };
    }

    const mimeType = String(meta.mime_type || media.mime_type || response.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
    const filename = safeFilename(media.filename || `${media.meta_media_id}${extensionForMime(mimeType)}`);
    const receivedAt = new Date(media.received_at || media.created_at || Date.now());
    const date = Number.isNaN(receivedAt.valueOf()) ? new Date() : receivedAt;
    const path = [
      media.organization_id,
      number.id,
      String(date.getUTCFullYear()),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0"),
      media.message_id,
      filename,
    ].join("/");

    const storageResponse = await fetch(`${projectUrl()}/storage/v1/object/${encodeURIComponent(media.storage_bucket || "azwa-whatsapp-media")}/${encodeStoragePath(path)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey()}`,
        apikey: serviceKey(),
        "Content-Type": mimeType,
        "x-upsert": "true",
      },
      body: response.body,
      duplex: "half" as any,
    } as RequestInit);

    if (!storageResponse.ok) {
      const storageBody = await storageResponse.text().catch(() => "");
      const err = `Storage upload failed (${storageResponse.status})${storageBody ? `: ${storageBody.slice(0,300)}` : ""}`;
      await markFailure(client, media, attempt?.id, err, storageResponse.status);
      return { ok: false, retryable: storageResponse.status === 429 || storageResponse.status >= 500, error: err };
    }

    await client.from("media").update({
      mime_type: mimeType,
      filename,
      file_size: meta.file_size != null ? Number(meta.file_size) : parseContentLength(response.headers.get("content-length")),
      sha256: meta.sha256 ?? media.sha256 ?? null,
      storage_provider: "supabase",
      storage_path: path,
      download_status: "stored",
      stored_at: new Date().toISOString(),
      last_error: null,
      metadata: { ...(media.metadata ?? {}), meta_media: stripTemporaryUrl(meta) },
    }).eq("id", media.id);

    if (attempt?.id) {
      await client.from("media_download_attempts").update({ status: "stored", http_status: 200, completed_at: new Date().toISOString() }).eq("id", attempt.id);
    }
    return { ok: true, retryable: false, storagePath: path };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markFailure(client, media, attempt?.id, message, null);
    return { ok: false, retryable: isRetryableNetworkError(error), error: message };
  }
}

async function markFailure(client: SupabaseClient, media: any, attemptId: string | undefined, message: string, httpStatus: number | null): Promise<void> {
  await client.from("media").update({ download_status: "failed", last_error: message }).eq("id", media.id);
  if (attemptId) {
    await client.from("media_download_attempts").update({
      status: "failed",
      http_status: httpStatus,
      error: message,
      completed_at: new Date().toISOString(),
    }).eq("id", attemptId);
  }
}

function stripTemporaryUrl(meta: any): Record<string, unknown> {
  const { url: _url, ...rest } = meta || {};
  return rest;
}

function safeFilename(name: string): string {
  const cleaned = name.normalize("NFKC").replace(/[\\/\0<>:"|?*\x00-\x1F]/g, "_").replace(/\s+/g, " ").trim();
  return (cleaned || "media.bin").slice(0, 180);
}

function extensionForMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
  };
  return map[mime.toLowerCase()] ?? ".bin";
}

function encodeStoragePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function isRetryableNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("timeout") || message.includes("tempor") || message.includes("connection") || message.includes("network") || message.includes("fetch");
}
