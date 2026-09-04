import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/jobs/recover")({
  server: {
    handlers: {
      POST: ({ request }) => recoverStaleJobs(request),
    },
  },
});

async function recoverStaleJobs(request: Request): Promise<Response> {
  const authFailure = await authenticateCronRequest(request);
  if (authFailure) return authFailure;

  const url = new URL(request.url);
  const rawSeconds = Number.parseInt(url.searchParams.get("older_than_seconds") ?? "300", 10);
  const olderThanSeconds = Number.isFinite(rawSeconds)
    ? Math.min(86_400, Math.max(60, rawSeconds))
    : 300;

  try {
    const { data, error } = await supabaseAdmin.rpc("backend_requeue_stale_jobs", {
      p_older_than_seconds: olderThanSeconds,
    });
    if (error) throw new Error(error.message);

    return Response.json({
      ok: true,
      recovered: Number(data ?? 0),
      olderThanSeconds,
    });
  } catch (error) {
    console.error("[AzWA job recovery] failed", error);
    return Response.json({ ok: false, error: "job_recovery_failed" }, { status: 500 });
  }
}
