import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { runAutomationQueue } from "@/lib/automation/engine.server";

export const Route = createFileRoute("/api/public/jobs/automation")({
  server: {
    handlers: {
      POST: ({ request }) => runAutomationWorker(request),
    },
  },
});

async function runAutomationWorker(request: Request): Promise<Response> {
  const authFailure = await authenticateCronRequest(request);
  if (authFailure) return authFailure;

  const url = new URL(request.url);
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 20;

  try {
    const results = await runAutomationQueue(limit);
    return Response.json({
      ok: true,
      processed: results.length,
      completed: results.filter((r) => r.status === "completed").length,
      failed: results.filter((r) => r.status === "failed").length,
      skipped: results.filter((r) => r.status === "skipped").length,
    });
  } catch (error) {
    console.error("[AzWA automation worker] queue drain failed", error);
    return Response.json({ ok: false, error: "automation_worker_failed" }, { status: 500 });
  }
}
