import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { drainMediaQueue } from "@/lib/meta/media.server";
import { drainMessageQueue } from "@/lib/meta/message-worker.server";
import { drainWebhookQueue } from "@/lib/meta/webhook-worker.server";

export const Route = createFileRoute("/api/public/jobs/runtime")({
  server: {
    handlers: {
      POST: ({ request }) => runRuntimeWorkers(request),
    },
  },
});

function parseLimit(url: URL, name: string, fallback: number) {
  const raw = Number.parseInt(url.searchParams.get(name) ?? String(fallback), 10);
  return Number.isFinite(raw) ? Math.min(100, Math.max(1, raw)) : fallback;
}

async function runRuntimeWorkers(request: Request): Promise<Response> {
  const authFailure = await authenticateCronRequest(request);
  if (authFailure) return authFailure;

  const url = new URL(request.url);
  const webhookLimit = parseLimit(url, "webhooks", 50);
  const messageLimit = parseLimit(url, "messages", 20);
  const mediaLimit = parseLimit(url, "media", 20);
  const workerPrefix = request.headers.get("x-azwa-worker-id")?.trim() || "runtime";

  try {
    const { data: recoveredData, error: recoveredError } = await supabaseAdmin.rpc(
      "backend_requeue_stale_jobs",
      { p_older_than_seconds: 300 },
    );
    if (recoveredError) throw new Error(`stale-job recovery failed: ${recoveredError.message}`);

    const webhookResults = await drainWebhookQueue(webhookLimit, `${workerPrefix}-webhooks`);
    const messageResults = await drainMessageQueue(messageLimit, `${workerPrefix}-messages`);
    const mediaResults = await drainMediaQueue(mediaLimit);

    return Response.json({
      ok: true,
      recovered: Number(recoveredData ?? 0),
      webhooks: {
        processed: webhookResults.length,
        completed: webhookResults.filter((result) => result.status === "processed").length,
        retried: webhookResults.filter((result) => result.status === "retry").length,
        dead: webhookResults.filter((result) => result.status === "dead").length,
        failed: webhookResults.filter((result) => result.status === "failed").length,
      },
      messages: {
        processed: messageResults.length,
        submitted: messageResults.filter((result) => result.status === "submitted").length,
        retried: messageResults.filter((result) => result.status === "retry").length,
        dead: messageResults.filter((result) => result.status === "dead").length,
        failed: messageResults.filter((result) => result.status === "failed").length,
      },
      media: {
        processed: mediaResults.length,
        downloaded: mediaResults.filter((result) => result.status === "downloaded").length,
        skipped: mediaResults.filter((result) => result.status === "skipped").length,
        failed: mediaResults.filter((result) => result.status === "failed").length,
      },
    });
  } catch (error) {
    console.error("[AzWA runtime worker] drain failed", error);
    return Response.json({ ok: false, error: "runtime_worker_failed" }, { status: 500 });
  }
}
