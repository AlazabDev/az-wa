import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          {
            ok: true,
            service: "az-wa",
            status: "live",
          },
          {
            headers: { "cache-control": "no-store" },
          },
        ),
    },
  },
});
