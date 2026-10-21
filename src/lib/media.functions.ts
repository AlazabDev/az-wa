import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { presignMinioGetUrl } from "@/lib/storage/minio.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Tables } from "@/integrations/supabase/types";

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
      } | void,
    ) => data,
  )
  .handler(async ({ data: filter }) => {
    const page = filter?.page ?? 1;
    const limit = filter?.limit ?? 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("media")
      .select("*, messages(conversation_id)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

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
          } } else if (publicToken) {
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
  .handler(async ({ data: mediaId }) => {
    const { error } = await supabaseAdmin
      .from("media")
      .delete()
      .eq("id", mediaId);

    if (error) {
      console.error("Failed to delete media:", error);
      throw new Error(error.message);
    }

    return { success: true };
  });
