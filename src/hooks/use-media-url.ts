import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves a media reference to a viewable signed URL.
 * Supports:
 * - Direct URLs (http/https) — returned as-is
 * - Storage references (storage_key + storage_bucket) — resolved via storage or fallback
 */
export function useMediaUrl(
  media:
    | {
        url?: string;
        storage_key?: string;
        storage_bucket?: string;
        media_file_id?: string;
        id?: string;
        mime_type?: string;
        mime?: string;
      }
    | null
    | undefined,
) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!media) {
      setResolvedUrl(null);
      return;
    }

    if (media.url && media.url.startsWith("http")) {
      setResolvedUrl(media.url);
      return;
    }

    if (media.storage_key) {
      setLoading(true);
      const bucket = media.storage_bucket || "wa-media";
      supabase.storage
        .from(bucket)
        .createSignedUrl(media.storage_key, 300)
        .then(({ data, error }) => {
          if (data?.signedUrl) {
            setResolvedUrl(data.signedUrl);
          } else {
            console.warn("[useMediaUrl] Failed to sign URL:", error);
            setResolvedUrl(null);
          }
        })
        .catch(() => setResolvedUrl(null))
        .finally(() => setLoading(false));
      return;
    }

    setResolvedUrl(null);
  }, [media?.url, media?.storage_key, media?.storage_bucket]);

  return { url: resolvedUrl, loading };
}
