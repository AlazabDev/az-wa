import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { presignMinioGetUrl } from "@/lib/storage/minio.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Tables, Database } from "@/integrations/supabase/types";

async function authorizeMedia(
  context: { supabase: SupabaseClient<Database> },
  permission: "media.read" | "media.manage",
): Promise<string> {
  const { data: organization, error } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("slug", "alazab-group")
    .maybeSingle();
  if (error || !organization?.id) throw new Error("AzWA organization is not configured");
  const { data: allowed, error: permissionError } = await context.supabase.rpc(
    "azwa_has_org_permission",
    { p_org_id: organization.id, p_permission: permission },
  );
  if (permissionError || !allowed) throw new Error("Forbidden");
  return organization.id;
}

export type MediaItemWithUrl = Tables<"media"> & {
  signedUrl: string | null;
  conversation?: { id: string | null } | null;
};

export const getMediaItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (
      data: {
        days?: number | "all";
        type?: string;
        startDate?: string;
        endDate?: string;
        page?: number;
        limit?: number;
        scoped?: boolean;
        numberIds?: string[];
      } | void,
    ) => data,
  )
  .handler(async ({ data: filter, context }) => {
    const organizationId = await authorizeMedia(context, "media.read");
    const scoped = filter?.scoped === true;
    const numberIds = [...new Set(filter?.numberIds ?? [])];
    if (numberIds.length > 200 || numberIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))) {
      throw new Error("Invalid WhatsApp number scope");
    }
    if (scoped && numberIds.length > 0) {
      const { data: permitted, error: scopeError } = await supabaseAdmin
        .from("whatsapp_numbers").select("id")
        .eq("organization_id", organizationId).in("id", numberIds);
      if (scopeError || (permitted ?? []).length !== numberIds.length) {
        throw new Error("Invalid organization number scope");
      }
    }
    if (scoped && numberIds.length === 0) return { items: [], totalCount: 0 };
    const page = filter?.page ?? 1;
    const limit = filter?.limit ?? 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("media")
      .select("*, messages(conversation_id)", { count: "exact" })
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (scoped) query = query.in("whatsapp_number_id", numberIds);

    if (filter?.type && filter.type !== "all") {
      if (filter.type === "image") {
        query = query.like("mime_type", "image/%");
      } else if (filter.type === "video") {
        query = query.like("mime_type", "video/%");
      } else if (filter.type === "audio") {
        query = query.like("mime_type", "audio/%");
      } else if (filter.type === "document") {
        query = query
          .not("mime_type", "like", "image/%")
          .not("mime_type", "like", "video/%")
          .not("mime_type", "like", "audio/%");
      } else if (filter.type === "pdf") {
        query = query.eq("mime_type", "application/pdf");
      }
    }

    if (filter?.days && filter.days !== "all") {
      const date = new Date();
      date.setDate(date.getDate() - filter.days);

      query = query.gte("created_at", date.toISOString());
    } else if (filter?.startDate && filter?.endDate) {
      query = query
        .gte("created_at", filter.startDate)
        .lte("created_at", filter.endDate);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error("Failed to fetch media:", error);
      throw new Error(error.message);
    }

    const items: MediaItemWithUrl[] = await Promise.all(
      (data ?? []).map(async (item) => {
        let signedUrl: string | null = null;

        if (item.storage_provider === "local" && item.storage_path) {
          const meta = (item.metadata ?? {}) as Record<string, unknown>;

          const publicUrl =
            typeof meta["public_url"] === "string"
              ? meta["public_url"]
              : null;

          const publicToken =
            typeof meta["public_token"] === "string"
              ? meta["public_token"]
              : null;

        if (publicUrl) {
          signedUrl = publicUrl;
           } else if (publicToken) {
          signedUrl = `/api/public/files/${encodeURIComponent(publicToken)}`;
}

        } else if (
          item.storage_provider === "minio" &&
          item.storage_path
        ) {
          const minioOptions: {
            key: string;
            expiresIn: number;
            bucket?: string;
            downloadName?: string;
          } = {
            key: item.storage_path,
            expiresIn: 60 * 60,
          };

          if (item.storage_bucket) {
            minioOptions.bucket = item.storage_bucket;
          }

          if (item.filename) {
            minioOptions.downloadName = item.filename;
          }

          signedUrl = await presignMinioGetUrl(minioOptions);
        }

        const conversation =
          Array.isArray(item.messages) && item.messages.length > 0
            ? { id: item.messages[0].conversation_id }
            : null;

        return {
          ...item,
          signedUrl,
          conversation,
        } as MediaItemWithUrl;
      }),
    );

    return {
      items,
      totalCount: count ?? 0,
    };
  });

export const deleteMediaItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: string) => data)
  .handler(async ({ data: mediaId, context }) => {
    const organizationId = await authorizeMedia(context, "media.manage");
    const { error } = await supabaseAdmin
      .from("media")
      .delete()
      .eq("organization_id", organizationId)
      .eq("id", mediaId);

    if (error) {
      console.error("Failed to delete media:", error);
      throw new Error(error.message);
    }

    return { success: true };
  });
