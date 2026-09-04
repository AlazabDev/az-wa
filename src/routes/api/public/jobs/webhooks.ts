import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { drainWebhookQueue } from "@/lib/meta/webhook-worker.server";

export const Route = createFileRoute("/api/public/jobs/webhooks")({
  server: {
    handlers: {
      POST: ({ request }) => runWebhookWorker(request),
    },
  },
});

async function runWebhookWorker(request: Request): Promise<Response> {
  const authFailure = await authenticateCronRequest(request);
  if (authFailure) return authFailure;

  const url = new URL(request.url);
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50;
  const workerId = request.headers.get("x-azwa-worker-id")?.trim() || undefined;

  try {
    const results = await drainWebhookQueue(limit, workerId);
    return Response.json({
      ok: true,
      processed: results.length,
      completed: results.filter((result) => result.status === "processed").length,
      retried: results.filter((result) => result.status === "retry").length,
      dead: results.filter((result) => result.status === "dead").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    });
  } catch (error) {
    console.error("[AzWA webhook worker] queue drain failed", error);
    return Response.json({ ok: false, error: "webhook_worker_failed" }, { status: 500 });
  }
}
