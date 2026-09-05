import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MEDIA_PERMISSION = "media.read";

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
};

type ListInput = {
  numberId?: string | undefined;
  status?: string | undefined;
  mediaType?: string | undefined;
  search?: string | undefined;
  limit?: number | undefined;
};

async function authorize(context: { supabase: { rpc: Function } }) {
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

/** Lists every archived WhatsApp file across all connected numbers. */
export const listStoredFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: ListInput) => input ?? {})
  .handler(async ({ data, context }): Promise<FilesResponse> => {
    const { organizationId, supabaseAdmin } = await authorize(context);
    const { minioBucketName } = await import("@/lib/storage/minio.server");

    const limit = Math.min(500, Math.max(1, Math.trunc(data.limit ?? 200)));

    const [{ data: numberRows }, mediaResult] = await Promise.all([
      supabaseAdmin
        .from("whatsapp_numbers")
        .select("id, display_phone_number, verified_name")
        .eq("organization_id", organizationId),
      (async () => {
        let query = supabaseAdmin
          .from("media")
          .select(
            "id, created_at, received_at, stored_at, media_type, mime_type, filename, file_size, download_status, storage_provider, storage_bucket, storage_path, last_error, whatsapp_number_id",
          )
          .eq("organization_id", organizationId);

        if (data.numberId) query = query.eq("whatsapp_number_id", data.numberId);
        if (data.status) query = query.eq("download_status", data.status);
        if (data.mediaType) query = query.eq("media_type", data.mediaType);
        if (data.search?.trim()) {
          const term = `%${data.search.trim()}%`;
          query = query.or(`filename.ilike.${term},storage_path.ilike.${term}`);
        }

        return query.order("created_at", { ascending: false }).limit(limit);
      })(),
    ]);

    if (mediaResult.error) throw new Error(mediaResult.error.message);

    const numbers = (numberRows ?? []).map((row) => ({
      id: row.id,
      label: row.verified_name
        ? `${row.verified_name} · ${row.display_phone_number ?? ""}`.trim()
        : (row.display_phone_number ?? row.id),
    }));
    const numberLabels = new Map(numbers.map((n) => [n.id, n.label]));

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

    const totals = files.reduce(
      (acc, file) => {
        acc.all += 1;
        acc.bytes += file.fileSize ?? 0;
        if (file.downloadStatus === "downloaded") acc.stored += 1;
        else if (file.downloadStatus === "failed") acc.failed += 1;
        else acc.pending += 1;
        return acc;
      },
      { all: 0, stored: 0, pending: 0, failed: 0, bytes: 0 },
    );

    let bucket = "";
    try {
      bucket = minioBucketName();
    } catch {
      bucket = "not configured";
    }

    return { bucket, files, numbers, totals };
  });

/** Issues a short-lived presigned MinIO URL for one archived file. */
export const getStoredFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { mediaId: string }) => input)
  .handler(async ({ data, context }): Promise<{ url: string; expiresIn: number }> => {
    const { organizationId, supabaseAdmin } = await authorize(context);
    const { presignMinioGetUrl } = await import("@/lib/storage/minio.server");

    const { data: media, error } = await supabaseAdmin
      .from("media")
      .select("id, storage_bucket, storage_path, filename, download_status")
      .eq("id", data.mediaId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!media?.storage_path) throw new Error("This file is not archived in MinIO yet");

    const expiresIn = 900;
    const url = presignMinioGetUrl({
      key: media.storage_path,
      expiresIn,
      ...(media.storage_bucket ? { bucket: media.storage_bucket } : {}),
      ...(media.filename ? { downloadName: media.filename } : {}),
    });
    return { url, expiresIn };
  });

/** Retries the MinIO archive for one media row (failed or pending downloads). */
export const retryStoredFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { mediaId: string }) => input)
  .handler(async ({ data, context }) => {
    const { organizationId, supabaseAdmin } = await authorize(context);

    const { data: media } = await supabaseAdmin
      .from("media")
      .select("id")
      .eq("id", data.mediaId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!media) throw new Error("File not found");

    const { downloadMedia } = await import("@/lib/meta/media.server");
    return downloadMedia(media.id);
  });
