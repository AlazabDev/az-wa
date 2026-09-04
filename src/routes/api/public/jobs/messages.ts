import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { drainMessageQueue } from "@/lib/meta/message-worker.server";

export const Route = createFileRoute("/api/public/jobs/messages")({
  server: {
    handlers: {
      POST: ({ request }) => runMessageWorker(request),
    },
  },
});

async function runMessageWorker(request: Request): Promise<Response> {
  const authFailure = await authenticateCronRequest(request);
  if (authFailure) return authFailure;

  const url = new URL(request.url);
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 20;
  const workerId = request.headers.get("x-azwa-worker-id")?.trim() || undefined;

  try {
    const results = await drainMessageQueue(limit, workerId);
    return Response.json({
      ok: true,
      processed: results.length,
      submitted: results.filter((result) => result.status === "submitted").length,
      retried: results.filter((result) => result.status === "retry").length,
      dead: results.filter((result) => result.status === "dead").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    });
  } catch (error) {
    console.error("[AzWA message worker] queue drain failed", error);
    return Response.json({ ok: false, error: "message_worker_failed" }, { status: 500 });
  }
}
