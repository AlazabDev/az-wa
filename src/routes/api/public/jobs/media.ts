import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { drainMediaQueue } from "@/lib/meta/media.server";

export const Route = createFileRoute("/api/public/jobs/media")({
  server: {
    handlers: {
      GET: ({ request }) => runMediaWorker(request),
      POST: ({ request }) => runMediaWorker(request),
    },
  },
});

async function runMediaWorker(request: Request): Promise<Response> {
  const authFailure = await authenticateCronRequest(request);
  if (authFailure) return authFailure;

  const url = new URL(request.url);
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 20;

  try {
    const results = await drainMediaQueue(limit);
    return Response.json({
      ok: true,
      processed: results.length,
      downloaded: results.filter((result) => result.status === "downloaded").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length,
    });
  } catch (error) {
    console.error("[AzWA media worker] queue drain failed", error);
    return Response.json({ ok: false, error: "media_worker_failed" }, { status: 500 });
  }
}
