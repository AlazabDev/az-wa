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

  const directUrl = media?.url;
  const storageKey = media?.storage_key;
  const storageBucket = media?.storage_bucket;

  useEffect(() => {
    let cancelled = false;
    if (!directUrl && !storageKey) {
      setResolvedUrl(null);
      setLoading(false);
      return;
    }
    if (directUrl?.startsWith("http")) {
      setResolvedUrl(directUrl);
      setLoading(false);
      return;
    }
    if (!storageKey) {
      setResolvedUrl(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const bucket = storageBucket || "wa-media";
    void supabase.storage.from(bucket).createSignedUrl(storageKey, 300)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (data?.signedUrl) setResolvedUrl(data.signedUrl);
        else {
          console.warn("[useMediaUrl] Failed to sign URL:", error);
          setResolvedUrl(null);
        }
      })
      .catch(() => {
        if (!cancelled) setResolvedUrl(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [directUrl, storageKey, storageBucket]);

  return { url: resolvedUrl, loading };
}
