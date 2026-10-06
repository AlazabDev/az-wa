import { createFileRoute } from "@tanstack/react-router";

/** Permanent public link for a stored file. Token is random and unguessable. */
export const Route = createFileRoute("/api/public/files/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const token = params.token;
        if (!/^[a-f0-9]{48}$/.test(token)) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { readLocalObject } = await import("@/lib/storage/local.server");

        const { data: media } = await supabaseAdmin
          .from("media")
          .select("storage_provider, storage_path, mime_type, filename")
          .eq("metadata->>public_token", token)
          .maybeSingle();
        if (!media?.storage_path || media.storage_provider !== "local") {
          return new Response("Not found", { status: 404 });
        }

        try {
          const bytes = await readLocalObject(media.storage_path);
          const download = new URL(request.url).searchParams.has("download");
          const name = (media.filename ?? media.storage_path.split("/").pop() ?? "file").replace(/"/g, "");
          return new Response(bytes as unknown as BodyInit, {
            headers: {
              "Content-Type": media.mime_type ?? "application/octet-stream",
              "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
              "Cache-Control": "public, max-age=31536000, immutable",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
