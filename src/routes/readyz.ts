import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/readyz")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin
            .from("organizations")
            .select("id", { head: true, count: "exact" })
            .limit(1);

          if (error) {
            console.error("[AzWA readyz] Supabase check failed", error.message);
            return Response.json(
              { ok: false, service: "az-wa", status: "not_ready" },
              { status: 503, headers: { "cache-control": "no-store" } },
            );
          }

          return Response.json(
            { ok: true, service: "az-wa", status: "ready" },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          console.error("[AzWA readyz] readiness check failed", error);
          return Response.json(
            { ok: false, service: "az-wa", status: "not_ready" },
            { status: 503, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
