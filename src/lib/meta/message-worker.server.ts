import { randomUUID } from "node:crypto";

import { supabaseAdmin, supabaseRuntimeAdmin } from "@/integrations/supabase/client.server";
import { clientForNumber } from "./graph.server";

type JobRow = {
  id: string;
  organization_id: string;
  queue_name: string;
  job_type: string;
  payload: Record<string, unknown> | null;
  attempt: number;
  max_attempts: number;
};

type OutboxRow = {
  id: string;
  organization_id: string;
  whatsapp_number_id: string;
  recipient_address: string;
  message_type: string;
  request_payload: Record<string, unknown>;
  status: string;
  meta_message_id: string | null;
  attempt_count: number;
};

type WorkerResult = {
  jobId: string;
  outboxId: string | null;
  status: "submitted" | "retry" | "dead" | "skipped" | "failed";
  metaMessageId?: string;
  error?: string;
};

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function retryableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function retryDelaySeconds(attempt: number): number {
  return Math.min(15 * 60, Math.max(15, 15 * 2 ** Math.max(0, attempt - 1)));
}

async function completeJob(jobId: string) {
  const { error } = await supabaseAdmin.rpc("backend_complete_job", { p_job_id: jobId });
  if (error) throw new Error(`Unable to complete job ${jobId}: ${error.message}`);
}

async function deadLetterJob(job: JobRow, errorMessage: string) {
  const { error: capError } = await supabaseRuntimeAdmin
    .from("jobs")
    .update({ max_attempts: Math.max(1, job.attempt) })
    .eq("id", job.id)
    .eq("organization_id", job.organization_id);
  if (capError) throw new Error(`Unable to cap job retries: ${capError.message}`);

  const { data, error } = await supabaseAdmin.rpc("backend_fail_job", {
    p_job_id: job.id,
    p_error: errorMessage,
    p_retry_after_seconds: 30,
  });
  if (error) throw new Error(`Unable to dead-letter job ${job.id}: ${error.message}`);
  return String(data ?? "dead");
}

async function retryJob(job: JobRow, errorMessage: string) {
  const { data, error } = await supabaseAdmin.rpc("backend_fail_job", {
    p_job_id: job.id,
    p_error: errorMessage,
    p_retry_after_seconds: retryDelaySeconds(job.attempt),
  });
  if (error) throw new Error(`Unable to retry job ${job.id}: ${error.message}`);
  return String(data ?? "retry");
}

async function recordAttemptStart(job: JobRow, outbox: OutboxRow) {
  const { data, error } = await supabaseRuntimeAdmin
    .from("message_send_attempts")
    .insert({
      organization_id: outbox.organization_id,
      outbox_id: outbox.id,
      attempt_no: Math.max(1, job.attempt),
      status: "started",
    })
    .select("id")
    .single();
  if (error) throw new Error(`Unable to record send attempt: ${error.message}`);
  return String(data.id);
}

async function recordAttemptResult(
  attemptId: string,
  status: "submitted" | "failed",
  httpStatus: number,
  errorCode: string | null,
  errorMessage: string | null,
  responseMeta: Record<string, unknown> | null,
) {
  const { error } = await supabaseRuntimeAdmin
    .from("message_send_attempts")
    .update({
      status,
      http_status: httpStatus,
      error_code: errorCode,
      error_message: errorMessage,
      response_meta: responseMeta ?? {},
    })
    .eq("id", attemptId);
  if (error) console.error("[AzWA message worker] unable to finalize send attempt", error.message);
}

async function loadOutbox(outboxId: string): Promise<OutboxRow | null> {
  const { data, error } = await supabaseRuntimeAdmin
    .from("message_outbox")
    .select(
      "id, organization_id, whatsapp_number_id, recipient_address, message_type, request_payload, status, meta_message_id, attempt_count",
    )
    .eq("id", outboxId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load outbox ${outboxId}: ${error.message}`);
  return (data as OutboxRow | null) ?? null;
}

async function markOutboxSending(outbox: OutboxRow) {
  const { data, error } = await supabaseRuntimeAdmin
    .from("message_outbox")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", outbox.id)
    .eq("organization_id", outbox.organization_id)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Unable to lock outbox ${outbox.id}: ${error.message}`);
  return Boolean(data?.id);
}

async function processMessageJob(job: JobRow): Promise<WorkerResult> {
  const outboxId = stringField(job.payload?.["outbox_id"]);
  if (!outboxId) {
    await deadLetterJob(job, "message-send job is missing payload.outbox_id");
    return { jobId: job.id, outboxId: null, status: "dead", error: "missing_outbox_id" };
  }

  const outbox = await loadOutbox(outboxId);
  if (!outbox) {
    await deadLetterJob(job, `Outbox ${outboxId} does not exist`);
    return { jobId: job.id, outboxId, status: "dead", error: "outbox_not_found" };
  }

  if (outbox.organization_id !== job.organization_id) {
    await deadLetterJob(job, `Job/outbox organization mismatch for ${outboxId}`);
    return { jobId: job.id, outboxId, status: "dead", error: "organization_mismatch" };
  }

  if (["submitted", "sent", "delivered", "read"].includes(outbox.status)) {
    await completeJob(job.id);
    return outbox.meta_message_id
      ? { jobId: job.id, outboxId, status: "skipped", metaMessageId: outbox.meta_message_id }
      : { jobId: job.id, outboxId, status: "skipped" };
  }

  if (["failed", "cancelled"].includes(outbox.status)) {
    await completeJob(job.id);
    return { jobId: job.id, outboxId, status: "skipped" };
  }

  if (outbox.status === "sending") {
    await deadLetterJob(job, `Outbox ${outboxId} is already sending; delivery state is ambiguous`);
    return { jobId: job.id, outboxId, status: "dead", error: "ambiguous_previous_send" };
  }

  const locked = await markOutboxSending(outbox);
  if (!locked) {
    await completeJob(job.id);
    return { jobId: job.id, outboxId, status: "skipped" };
  }

  const attemptId = await recordAttemptStart(job, outbox);
  const { client, number } = await clientForNumber(outbox.whatsapp_number_id);
  if (!client || !number) {
    const message = "No active Meta credential is available for the sender number";
    await recordAttemptResult(attemptId, "failed", 0, "credential_missing", message, null);
    await supabaseAdmin.rpc("backend_finalize_outbox_failure", {
      p_outbox_id: outbox.id,
      p_error: message,
      p_final: true,
    });
    await deadLetterJob(job, message);
    return { jobId: job.id, outboxId, status: "dead", error: message };
  }

  const result = await client.request<{ messages?: Array<{ id?: string }> }>(
    `${number.meta_phone_number_id}/messages`,
    { method: "POST", body: outbox.request_payload },
  );

  if (!result.ok) {
    const message = result.errorMessage ?? `Meta send failed with HTTP ${result.status}`;
    await recordAttemptResult(
      attemptId,
      "failed",
      result.status,
      result.errorCode ?? null,
      message,
      null,
    );

    const canRetry = result.status > 0 && retryableHttpStatus(result.status);
    await supabaseAdmin.rpc("backend_finalize_outbox_failure", {
      p_outbox_id: outbox.id,
      p_error: message,
      p_final: !canRetry,
    });

    if (canRetry) {
      const state = await retryJob(job, message);
      return { jobId: job.id, outboxId, status: state === "dead" ? "dead" : "retry", error: message };
    }

    await deadLetterJob(job, message);
    return { jobId: job.id, outboxId, status: "dead", error: message };
  }

  const metaMessageId = result.data?.messages?.[0]?.id ?? null;
  if (!metaMessageId) {
    const message = "Meta returned success without a message ID; automatic resend blocked";
    await recordAttemptResult(attemptId, "failed", result.status, "missing_message_id", message, result.data ?? null);
    await supabaseAdmin.rpc("backend_finalize_outbox_failure", {
      p_outbox_id: outbox.id,
      p_error: message,
      p_final: true,
    });
    await deadLetterJob(job, message);
    return { jobId: job.id, outboxId, status: "dead", error: message };
  }

  await recordAttemptResult(attemptId, "submitted", result.status, null, null, result.data ?? null);

  const { error: finalizeError } = await supabaseAdmin.rpc("backend_finalize_outbox_success", {
    p_outbox_id: outbox.id,
    p_meta_message_id: metaMessageId,
    p_raw_response: result.data ?? {},
  });

  if (finalizeError) {
    await supabaseRuntimeAdmin
      .from("message_outbox")
      .update({
        status: "submitted",
        meta_message_id: metaMessageId,
        submitted_at: new Date().toISOString(),
        last_error: `local_finalize_failed: ${finalizeError.message}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", outbox.id)
      .eq("organization_id", outbox.organization_id);

    await deadLetterJob(job, `Meta accepted ${metaMessageId}, but local finalize failed: ${finalizeError.message}`);
    return {
      jobId: job.id,
      outboxId,
      status: "dead",
      metaMessageId,
      error: "local_finalize_failed",
    };
  }

  await completeJob(job.id);
  return { jobId: job.id, outboxId, status: "submitted", metaMessageId };
}

export async function drainMessageQueue(limit = 20, workerId = `message-worker-${randomUUID()}`) {
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
  const { data, error } = await supabaseAdmin.rpc("backend_claim_jobs", {
    p_worker_id: workerId,
    p_queue_names: ["message-send"],
    p_limit: safeLimit,
  });
  if (error) throw new Error(`Unable to claim message jobs: ${error.message}`);

  const jobs = (Array.isArray(data) ? data : []) as JobRow[];
  const results: WorkerResult[] = [];
  for (const job of jobs) {
    try {
      results.push(await processMessageJob(job));
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown worker error";
      console.error("[AzWA message worker] job failed", job.id, error);
      try {
        const state = await retryJob(job, message);
        results.push({
          jobId: job.id,
          outboxId: stringField(job.payload?.["outbox_id"]),
          status: state === "dead" ? "dead" : "retry",
          error: message,
        });
      } catch (retryError) {
        console.error("[AzWA message worker] unable to persist retry state", retryError);
        results.push({
          jobId: job.id,
          outboxId: stringField(job.payload?.["outbox_id"]),
          status: "failed",
          error: message,
        });
      }
    }
  }
  return results;
}
