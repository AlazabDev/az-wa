import { supabaseAdmin, supabaseRuntimeAdmin } from "@/integrations/supabase/client.server";
import { syncWabaFlows } from "./flows.server";
import {
  applyTemplateWebhookChange,
  isTemplateWebhookField,
} from "./template-webhook.server";

type MetaMessage = Record<string, unknown> & { id?: string; from?: string; type?: string };
type MetaStatus = Record<string, unknown> & { id?: string; status?: string };
type MetaContact = { wa_id?: string; profile?: { name?: string } };

type Change = {
  field?: string;
  value?: Record<string, unknown> & {
    metadata?: { phone_number_id?: string; display_phone_number?: string };
    contacts?: MetaContact[];
    messages?: MetaMessage[];
    statuses?: MetaStatus[];
    message_template_id?: string | number;
  };
};

type PersistedEvent = {
  id: string;
  organization_id: string;
  meta_waba_id: string | null;
  meta_phone_number_id: string | null;
  event_type: string;
  payload: { entry_id?: string | null; change?: Change } | null;
  status: string;
};

type JobRow = {
  id: string;
  organization_id: string;
  payload: Record<string, unknown> | null;
  attempt: number;
  max_attempts: number;
};

export type WebhookWorkerResult = {
  jobId: string;
  eventId: string | null;
  status: "processed" | "retry" | "dead" | "skipped" | "failed";
  error?: string;
};

const OPERATIONAL_ALERT_FIELDS = new Set([
  "security",
  "account_alerts",
  "account_update",
  "account_review_update",
  "business_capability_update",
  "phone_number_quality_update",
  "phone_number_name_update",
]);

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function nullableDbString(value: string | null | undefined): string {
  return value ?? (null as unknown as string);
}

async function ensureOperationalAlert(
  organizationId: string,
  metaWabaId: string | null,
  field: string,
  value: Record<string, unknown>,
) {
  const alertType = `meta_${field}`;
  const { data: existing } = await supabaseRuntimeAdmin
    .from("alerts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("alert_type", alertType)
    .eq("status", "open")
    .contains("details", { meta_waba_id: metaWabaId, field })
    .limit(1)
    .maybeSingle();
  if (existing) return;

  const severity = field === "security" || field === "account_alerts" ? "critical" : "warning";
  const { error } = await supabaseRuntimeAdmin.from("alerts").insert({
    organization_id: organizationId,
    alert_type: alertType,
    severity,
    title: `Meta WhatsApp: ${field}`,
    message: `Operational webhook received for WABA ${metaWabaId ?? "unknown"}`,
    status: "open",
    details: { meta_waba_id: metaWabaId, field, value: asJson(value) },
  });
  if (error) throw new Error(`Unable to persist operational alert: ${error.message}`);
}

async function refreshFlows(organizationId: string, metaWabaId: string | null) {
  if (!metaWabaId) return;
  const { data: waba, error } = await supabaseAdmin
    .from("wabas")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("meta_waba_id", metaWabaId)
    .maybeSingle();
  if (error) throw new Error(`Unable to resolve WABA for flow refresh: ${error.message}`);
  if (waba?.id) await syncWabaFlows(waba.id);
}

async function processPersistedEvent(eventId: string) {
  const { data, error } = await supabaseRuntimeAdmin
    .from("webhook_events")
    .select(
      "id, organization_id, meta_waba_id, meta_phone_number_id, event_type, payload, status",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load webhook event ${eventId}: ${error.message}`);
  if (!data) return { status: "missing" as const };

  const event = data as PersistedEvent;
  if (event.status === "processed" || event.status === "ignored") {
    return { status: "already_processed" as const };
  }
  if (event.status === "unmapped_number_event") {
    return { status: "unmapped" as const };
  }

  const change = event.payload?.change ?? {};
  const value = change.value ?? {};
  const field = change.field ?? event.event_type ?? "unknown";
  const metaWabaId = event.meta_waba_id ?? event.payload?.entry_id ?? null;
  const metaPhoneId = event.meta_phone_number_id ?? value.metadata?.phone_number_id ?? null;

  if (isTemplateWebhookField(field)) {
    const applied = await applyTemplateWebhookChange({
      organizationId: event.organization_id,
      metaWabaId,
      field,
      value,
    });
    if (applied.handled && !applied.updated && applied.error) {
      throw new Error(applied.error);
    }
  }

  if (field === "flows") {
    await refreshFlows(event.organization_id, metaWabaId);
  }

  if (OPERATIONAL_ALERT_FIELDS.has(field)) {
    await ensureOperationalAlert(event.organization_id, metaWabaId, field, value);
  }

  if (metaPhoneId) {
    for (const message of value.messages ?? []) {
      const sender = typeof message.from === "string" ? message.from : null;
      const contact = (value.contacts ?? []).find(
        (candidate) => candidate.wa_id && candidate.wa_id === sender,
      );

      const { data: inbound, error: inboundError } = await supabaseAdmin.rpc(
        "backend_ingest_inbound_message",
        {
          p_organization_id: event.organization_id,
          p_meta_phone_number_id: metaPhoneId,
          p_contact_wa_id: nullableDbString(sender),
          p_contact_profile_name: nullableDbString(contact?.profile?.name),
          p_message: asJson(message),
        },
      );
      if (inboundError) throw new Error(`Inbound message ingest failed: ${inboundError.message}`);

      if (
        inbound &&
        typeof inbound === "object" &&
        "status" in inbound &&
        String((inbound as Record<string, unknown>)["status"]) === "unmapped_number"
      ) {
        throw new Error(`Phone number ${metaPhoneId} became unmapped during webhook processing`);
      }
    }

    for (const status of value.statuses ?? []) {
      const { data: applied, error: statusError } = await supabaseAdmin.rpc(
        "backend_apply_message_status",
        {
          p_organization_id: event.organization_id,
          p_meta_phone_number_id: metaPhoneId,
          p_status: asJson(status),
        },
      );
      if (statusError) throw new Error(`Message status ingest failed: ${statusError.message}`);

      if (
        applied &&
        typeof applied === "object" &&
        "status" in applied &&
        String((applied as Record<string, unknown>)["status"]) === "unmapped_number"
      ) {
        throw new Error(`Phone number ${metaPhoneId} became unmapped during status processing`);
      }
    }
  }

  const { error: finalizeError } = await supabaseAdmin.rpc("backend_finalize_webhook_event", {
    p_event_id: event.id,
    p_success: true,
    p_error: nullableDbString(null),
  });
  if (finalizeError) throw new Error(`Unable to finalize webhook event: ${finalizeError.message}`);

  return { status: "processed" as const };
}

async function failJob(job: JobRow, errorMessage: string) {
  const { data, error } = await supabaseAdmin.rpc("backend_fail_job", {
    p_job_id: job.id,
    p_error: errorMessage,
    p_retry_after_seconds: Math.min(15 * 60, Math.max(15, 15 * 2 ** Math.max(0, job.attempt - 1))),
  });
  if (error) throw new Error(`Unable to persist webhook retry: ${error.message}`);
  return String(data ?? "retry");
}

async function completeJob(jobId: string) {
  const { error } = await supabaseAdmin.rpc("backend_complete_job", { p_job_id: jobId });
  if (error) throw new Error(`Unable to complete webhook job: ${error.message}`);
}

export async function drainWebhookQueue(limit = 50, workerId = `webhook-worker-${crypto.randomUUID()}`) {
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
  const { data, error } = await supabaseAdmin.rpc("backend_claim_jobs", {
    p_worker_id: workerId,
    p_queue_names: ["webhook-process"],
    p_limit: safeLimit,
  });
  if (error) throw new Error(`Unable to claim webhook jobs: ${error.message}`);

  const jobs = (Array.isArray(data) ? data : []) as JobRow[];
  const results: WebhookWorkerResult[] = [];

  for (const job of jobs) {
    const eventId = stringField(job.payload?.["event_id"]);
    if (!eventId) {
      const message = "webhook-process job is missing payload.event_id";
      const state = await failJob(job, message);
      results.push({ jobId: job.id, eventId: null, status: state === "dead" ? "dead" : "retry", error: message });
      continue;
    }

    try {
      const processed = await processPersistedEvent(eventId);
      if (processed.status === "missing") {
        const state = await failJob(job, `Webhook event ${eventId} does not exist`);
        results.push({
          jobId: job.id,
          eventId,
          status: state === "dead" ? "dead" : "retry",
          error: "event_not_found",
        });
        continue;
      }

      await completeJob(job.id);
      results.push({
        jobId: job.id,
        eventId,
        status: processed.status === "processed" ? "processed" : "skipped",
      });
    } catch (workerError) {
      const message = workerError instanceof Error ? workerError.message : "unknown webhook worker error";
      console.error("[AzWA webhook worker] processing failed", eventId, workerError);

      const state = await failJob(job, message);
      if (state === "dead") {
        await supabaseAdmin.rpc("backend_finalize_webhook_event", {
          p_event_id: eventId,
          p_success: false,
          p_error: message,
        });
      } else {
        await supabaseRuntimeAdmin
          .from("webhook_events")
          .update({ error: message })
          .eq("id", eventId)
          .eq("organization_id", job.organization_id);
      }

      results.push({
        jobId: job.id,
        eventId,
        status: state === "dead" ? "dead" : "retry",
        error: message,
      });
    }
  }

  return results;
}
