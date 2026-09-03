import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { drainCpsMediaQueue } from "@/lib/cps/media-processing.server";

export const Route = createFileRoute("/api/public/jobs/cps-media")({
  server: {
    handlers: {
      POST: ({ request }) => runCpsMediaWorker(request),
    },
  },
});

async function runCpsMediaWorker(request: Request): Promise<Response> {
  const authFailure = await authenticateCronRequest(request);
  if (authFailure) return authFailure;

  const url = new URL(request.url);
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 20;

  try {
    const results = await drainCpsMediaQueue(limit);
    return Response.json({
      ok: true,
      processed: results.length,
      submitted: results.filter((result) => result.status === "submitted").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length,
    });
  } catch (error) {
    console.error("[AzWA CPS media worker] queue drain failed", error);
    return Response.json({ ok: false, error: "cps_media_worker_failed" }, { status: 500 });
  }
}
