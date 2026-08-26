import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { JobRow } from "./types.ts";
import { processWebhookEvent } from "./webhook_processor.ts";
import { downloadWhatsappMedia } from "./media.ts";
import { sendOutboxMessage, type WorkResult } from "./outbox.ts";
import { processAutomationRun } from "./automation.ts";
import { deliverOutgoingWebhook } from "./outgoing_webhook.ts";
import { runMetaSync } from "./sync.ts";

export const DEFAULT_QUEUES = [
  "webhook-events",
  "media-downloads",
  "message-send",
  "automation",
  "outgoing-webhooks",
  "meta-sync",
];

export async function drainQueues(
  client: SupabaseClient,
  options: {
    workerId?: string;
    queues?: string[];
    batchSize?: number;
    maxBatches?: number;
    maxRuntimeMs?: number;
  } = {},
): Promise<Record<string, unknown>> {
  const workerId = options.workerId ?? `edge:${crypto.randomUUID()}`;
  const queues = options.queues ?? DEFAULT_QUEUES;
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 20, 100));
  const maxBatches = Math.max(1, Math.min(options.maxBatches ?? 5, 50));
  const maxRuntimeMs = Math.max(1000, Math.min(options.maxRuntimeMs ?? 25_000, 120_000));
  const started = Date.now();
  const stats = { claimed: 0, completed: 0, retried: 0, deferred: 0, failed: 0, batches: 0, scheduled_campaigns: 0 };

  stats.scheduled_campaigns = await enqueueDueCampaigns(client);
  const { error: staleError } = await client.rpc("backend_requeue_stale_jobs", { p_older_than_seconds: 300 });
  if (staleError) console.warn("stale job recovery failed", staleError.message);

  for (let batch = 0; batch < maxBatches && Date.now() - started < maxRuntimeMs; batch++) {
    const { data: jobs, error } = await client.rpc("backend_claim_jobs", {
      p_worker_id: workerId,
      p_queue_names: queues,
      p_limit: batchSize,
    });
    if (error) throw new Error(`Job claim failed: ${error.message}`);
    const rows = (jobs ?? []) as JobRow[];
    if (rows.length === 0) break;
    stats.batches += 1;
    stats.claimed += rows.length;

    for (const job of rows) {
      if (Date.now() - started >= maxRuntimeMs) {
        await client.rpc("backend_defer_job", { p_job_id: job.id, p_seconds: 1 });
        stats.deferred += 1;
        continue;
      }
      try {
        const result = await processJob(client, job);
        if (result.action === "complete") {
          const { error: completeError } = await client.rpc("backend_complete_job", { p_job_id: job.id });
          if (completeError) throw new Error(completeError.message);
          stats.completed += 1;
        } else if (result.action === "defer") {
          const { error: deferError } = await client.rpc("backend_defer_job", { p_job_id: job.id, p_seconds: result.seconds });
          if (deferError) throw new Error(deferError.message);
          stats.deferred += 1;
        } else {
          const { data: state, error: failError } = await client.rpc("backend_fail_job", {
            p_job_id: job.id,
            p_error: result.error,
            p_retry_after_seconds: result.retryAfterSeconds,
          });
          if (failError) throw new Error(failError.message);
          if (state === "dead") stats.failed += 1; else stats.retried += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryAfter = exponentialBackoff(Number(job.attempt ?? 1));
        const { data: state } = await client.rpc("backend_fail_job", {
          p_job_id: job.id,
          p_error: message,
          p_retry_after_seconds: retryAfter,
        });
        if (state === "dead") stats.failed += 1; else stats.retried += 1;
        console.error("job processing failed", { job_id: job.id, queue: job.queue_name, type: job.job_type, attempt: job.attempt, error: message });
      }
    }
  }
  return { worker_id: workerId, queues, duration_ms: Date.now() - started, ...stats };
}

async function processJob(client: SupabaseClient, job: JobRow): Promise<WorkResult> {
  switch (job.job_type) {
    case "process_webhook_event": {
      const id = requiredPayloadString(job, "webhook_event_id");
      await processWebhookEvent(client, id);
      return { action: "complete" };
    }
    case "download_whatsapp_media": {
      const id = requiredPayloadString(job, "media_id");
      const result = await downloadWhatsappMedia(client, id);
      if (result.ok) return { action: "complete", detail: result };
      if (!result.retryable || Number(job.attempt) >= Number(job.max_attempts)) return { action: "complete", detail: { failed: true, error: result.error } };
      return { action: "retry", error: result.error ?? "Media download failed", retryAfterSeconds: exponentialBackoff(Number(job.attempt)) };
    }
    case "send_whatsapp_message": {
      const id = requiredPayloadString(job, "outbox_id");
      return await sendOutboxMessage(client, id, Number(job.attempt), Number(job.max_attempts));
    }
    case "run_automation": {
      const id = requiredPayloadString(job, "automation_run_id");
      await processAutomationRun(client, id);
      return { action: "complete" };
    }
    case "deliver_outgoing_webhook": {
      const id = requiredPayloadString(job, "delivery_id");
      return await deliverOutgoingWebhook(client, id, Number(job.attempt), Number(job.max_attempts));
    }
    case "meta_sync": {
      const p = job.payload as any;
      await runMetaSync(client, {
        organizationId: String(p.organization_id ?? job.organization_id),
        requestedBy: p.requested_by ? String(p.requested_by) : null,
        syncType: p.sync_type,
        businessPortfolioId: p.business_portfolio_id ? String(p.business_portfolio_id) : null,
        wabaId: p.waba_id ? String(p.waba_id) : null,
        whatsappNumberId: p.whatsapp_number_id ? String(p.whatsapp_number_id) : null,
      });
      return { action: "complete" };
    }
    default:
      return { action: "complete", detail: { ignored: true, reason: `Unsupported job type: ${job.job_type}` } };
  }
}

function requiredPayloadString(job: JobRow, key: string): string {
  const value = (job.payload as any)?.[key];
  if (typeof value !== "string" || !value) throw new Error(`Job ${job.id} missing payload.${key}`);
  return value;
}

function exponentialBackoff(attempt: number): number {
  const schedule = [5, 30, 120, 600, 1800, 3600];
  return schedule[Math.min(Math.max(attempt - 1, 0), schedule.length - 1)];
}

async function enqueueDueCampaigns(client: SupabaseClient): Promise<number> {
  const { data: campaigns, error } = await client
    .from("campaigns")
    .select("id,created_by")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(20);
  if (error) {
    console.warn("scheduled campaign lookup failed", error.message);
    return 0;
  }
  let count = 0;
  for (const campaign of campaigns ?? []) {
    const { error: enqueueError } = await client.rpc("backend_enqueue_campaign", {
      p_campaign_id: campaign.id,
      p_requested_by: campaign.created_by ?? null,
    });
    if (enqueueError) {
      console.error("scheduled campaign enqueue failed", { campaign_id: campaign.id, message: enqueueError.message });
      continue;
    }
    count += 1;
  }
  return count;
}
