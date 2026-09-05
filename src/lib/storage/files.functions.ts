import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const MEDIA_PERMISSION = "media.read";
const TOTALS_BATCH_SIZE = 1000;

export type StoredFile = {
  id: string;
  createdAt: string | null;
  receivedAt: string | null;
  storedAt: string | null;
  mediaType: string | null;
  mimeType: string | null;
  filename: string | null;
  fileSize: number | null;
  downloadStatus: string | null;
  storageProvider: string | null;
  storageBucket: string | null;
  storagePath: string | null;
  lastError: string | null;
  numberId: string | null;
  numberLabel: string;
};

export type FilesResponse = {
  bucket: string;
  files: StoredFile[];
  numbers: { id: string; label: string }[];
  totals: { all: number; stored: number; pending: number; failed: number; bytes: number };
  page: number;
  pageSize: number;
  totalPages: number;
};

type ListInput = {
  numberId?: string | undefined;
  status?: string | undefined;
  mediaType?: string | undefined;
  search?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
};

async function authorize(context: { supabase: SupabaseClient<Database> }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: organization, error: organizationError } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("slug", "alazab-group")
    .maybeSingle();
  if (organizationError || !organization?.id) {
    throw new Error(organizationError?.message ?? "Alazab Group organization is not configured");
  }

  const { data: allowed, error: permissionError } = await context.supabase.rpc(
    "azwa_has_org_permission",
    { p_org_id: organization.id, p_permission: MEDIA_PERMISSION },
  );
  if (permissionError || !allowed) throw new Error("Forbidden");

  return { organizationId: organization.id as string, supabaseAdmin };
}

function normalizedSearch(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return `%${trimmed.replace(/[%_,()]/g, " ")}%`;
}

/** Lists archived WhatsApp files across every connected number in Alazab Group. */
export const listStoredFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: ListInput) => input ?? {})
  .handler(async ({ data, context }): Promise<FilesResponse> => {
    const { organizationId, supabaseAdmin } = await authorize(context);
    const { minioBucketName } = await import("@/lib/storage/minio.server");

    const pageSize = Math.min(200, Math.max(25, Math.trunc(data.pageSize ?? 100)));
    const page = Math.max(1, Math.trunc(data.page ?? 1));
    const search = normalizedSearch(data.search);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const numberQuery = supabaseAdmin
      .from("whatsapp_numbers")
      .select("id, display_phone_number, verified_name")
      .eq("organization_id", organizationId)
      .order("display_phone_number", { ascending: true });

    let mediaQuery = supabaseAdmin
      .from("media")
      .select(
        "id, created_at, received_at, stored_at, media_type, mime_type, filename, file_size, download_status, storage_provider, storage_bucket, storage_path, last_error, whatsapp_number_id",
      )
      .eq("organization_id", organizationId);

    if (data.numberId) mediaQuery = mediaQuery.eq("whatsapp_number_id", data.numberId);
    if (data.status) mediaQuery = mediaQuery.eq("download_status", data.status);
    if (data.mediaType) mediaQuery = mediaQuery.eq("media_type", data.mediaType);
    if (search) mediaQuery = mediaQuery.or(`filename.ilike.${search},storage_path.ilike.${search}`);

    const totalsPromise = (async () => {
      const totals = { all: 0, stored: 0, pending: 0, failed: 0, bytes: 0 };
      let offset = 0;

      for (;;) {
        let totalsQuery = supabaseAdmin
          .from("media")
          .select("file_size, download_status")
          .eq("organization_id", organizationId);

        if (data.numberId) totalsQuery = totalsQuery.eq("whatsapp_number_id", data.numberId);
        if (data.status) totalsQuery = totalsQuery.eq("download_status", data.status);
        if (data.mediaType) totalsQuery = totalsQuery.eq("media_type", data.mediaType);
        if (search) totalsQuery = totalsQuery.or(`filename.ilike.${search},storage_path.ilike.${search}`);

        const batch = await totalsQuery.range(offset, offset + TOTALS_BATCH_SIZE - 1);
        if (batch.error) throw new Error(batch.error.message);

        const rows = batch.data ?? [];
        for (const row of rows) {
          totals.all += 1;
          totals.bytes += row.file_size ?? 0;
          if (row.download_status === "downloaded") totals.stored += 1;
          else if (row.download_status === "failed") totals.failed += 1;
          else totals.pending += 1;
        }

        if (rows.length < TOTALS_BATCH_SIZE) break;
        offset += TOTALS_BATCH_SIZE;
      }

      return totals;
    })();

    const [numberResult, mediaResult, totals] = await Promise.all([
      numberQuery,
      mediaQuery.order("created_at", { ascending: false }).range(from, to),
      totalsPromise,
    ]);

    if (numberResult.error) throw new Error(numberResult.error.message);
    if (mediaResult.error) throw new Error(mediaResult.error.message);

    const numbers = (numberResult.data ?? []).map((row) => ({
      id: row.id,
      label: row.verified_name
        ? `${row.verified_name} · ${row.display_phone_number ?? ""}`.trim()
        : (row.display_phone_number ?? row.id),
    }));
    const numberLabels = new Map(numbers.map((number) => [number.id, number.label]));

    const files: StoredFile[] = (mediaResult.data ?? []).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      receivedAt: row.received_at,
      storedAt: row.stored_at,
      mediaType: row.media_type,
      mimeType: row.mime_type,
      filename: row.filename,
      fileSize: row.file_size,
      downloadStatus: row.download_status,
      storageProvider: row.storage_provider,
      storageBucket: row.storage_bucket,
      storagePath: row.storage_path,
      lastError: row.last_error,
      numberId: row.whatsapp_number_id,
      numberLabel: row.whatsapp_number_id
        ? (numberLabels.get(row.whatsapp_number_id) ?? "Unmapped number")
        : "Unmapped number",
    }));

    let bucket = "";
    try {
      bucket = minioBucketName();
    } catch {
      bucket = "not configured";
    }

    return {
      bucket,
      files,
      numbers,
      totals,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totals.all / pageSize)),
    };
  });

/** Issues a short-lived presigned Milano/MinIO URL without exposing credentials. */
export const getStoredFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { mediaId: string }) => input)
  .handler(async ({ data, context }): Promise<{ url: string; expiresIn: number }> => {
    const { organizationId, supabaseAdmin } = await authorize(context);
    const { presignMinioGetUrl } = await import("@/lib/storage/minio.server");

    const { data: media, error } = await supabaseAdmin
      .from("media")
      .select("id, storage_provider, storage_bucket, storage_path, filename, download_status")
      .eq("id", data.mediaId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!media?.storage_path || media.storage_provider !== "minio") {
      throw new Error("This file is not archived in Milano yet");
    }

    const expiresIn = 900;
    const url = presignMinioGetUrl({
      key: media.storage_path,
      expiresIn,
      ...(media.storage_bucket ? { bucket: media.storage_bucket } : {}),
      ...(media.filename ? { downloadName: media.filename } : {}),
    });
    return { url, expiresIn };
  });

/** Retries Meta -> Milano archival for one failed or pending media row. */
export const retryStoredFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { mediaId: string }) => input)
  .handler(async ({ data, context }) => {
    const { organizationId, supabaseAdmin } = await authorize(context);

    const { data: media, error } = await supabaseAdmin
      .from("media")
      .select("id, download_status")
      .eq("id", data.mediaId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!media) throw new Error("File not found");
    if (media.download_status === "downloaded") {
      return { mediaId: media.id, status: "skipped" as const, storagePath: undefined };
    }
    if (media.download_status === "downloading") {
      throw new Error("This file is already being archived");
    }

    const { downloadMedia } = await import("@/lib/meta/media.server");
    return downloadMedia(media.id);
  });
