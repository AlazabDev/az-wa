/**
 * Automation Engine — orchestration.
 *
 * Two halves, deliberately kept fast vs. slow like the media pipeline:
 *
 *  triggerAutomations()  — called inline from the webhook handler. Only does
 *                           DB reads/writes (rule matching + condition
 *                           evaluation + enqueue), no Meta API calls, so it
 *                           stays fast enough to run before the webhook
 *                           response is sent.
 *
 *  runAutomationQueue()  — claims queued runs from the generic `jobs` table
 *                           (queue_name = 'automation') and actually executes
 *                           each rule's actions, which may call the Meta
 *                           Graph API. Triggered fire-and-forget from the
 *                           webhook (same pattern as drainMediaQueue) with a
 *                           cron worker as the retry safety net.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { evaluateConditions } from "./evaluate.server";
import { executeAction } from "./actions.server";
import type { ActionDef, AutomationTriggerContext, Condition, TriggerType } from "./types";

const AUTOMATION_QUEUE = "automation";

type RuleRow = {
  id: string;
  organization_id: string;
  name: string;
  conditions: Condition[];
  actions: ActionDef[];
  priority: number;
};

async function matchingRules(ctx: AutomationTriggerContext): Promise<RuleRow[]> {
  let query = supabaseAdmin
    .from("automation_rules")
    .select("id, organization_id, name, conditions, actions, priority")
    .eq("organization_id", ctx.organizationId)
    .eq("trigger_type", ctx.triggerType)
    .eq("is_enabled", true)
    .order("priority", { ascending: true });

  // Scope filter: a rule scoped to a specific number/WABA/portfolio only
  // matches events in that exact scope. A rule with all three scope columns
  // null applies to every number in the organization.
  query = query.or(
    `scope_whatsapp_number_id.is.null,scope_whatsapp_number_id.eq.${ctx.whatsappNumberId}`,
  );

  const { data, error } = await query;
  if (error) {
    console.error("[AzWA automation] rule lookup failed", error.message);
    return [];
  }

  // Extra scope narrowing (WABA / business portfolio) done in application
  // code, since PostgREST .or() cannot easily express three independent
  // "null OR equals" clauses ANDed together in one query string.
  const { data: numberRows } = await supabaseAdmin
    .from("automation_rules")
    .select("id, scope_waba_id, scope_business_portfolio_id")
    .in(
      "id",
      (data ?? []).map((r) => r.id),
    );
  const scopeById = new Map((numberRows ?? []).map((r) => [r.id, r]));

  return (data ?? []).filter((rule) => {
    const scope = scopeById.get(rule.id);
    if (!scope) return true;
    if (scope.scope_waba_id && scope.scope_waba_id !== ctx.wabaId) return false;
    if (
      scope.scope_business_portfolio_id &&
      scope.scope_business_portfolio_id !== ctx.businessPortfolioId
    )
      return false;
    return true;
  }) as RuleRow[];
}

/**
 * Matches enabled rules against a trigger, evaluates their conditions, and
 * enqueues an automation_runs row + job for every rule that passes. Safe to
 * call multiple times for the same event (job dedup key prevents doubles).
 */
export async function triggerAutomations(ctx: AutomationTriggerContext): Promise<void> {
  const rules = await matchingRules(ctx);
  if (rules.length === 0) return;

  for (const rule of rules) {
    const passed = await evaluateConditions(rule.conditions ?? [], ctx);
    if (!passed) continue;

    const inputPayload = {
      contact_id: ctx.contactId,
      waba_id: ctx.wabaId,
      business_portfolio_id: ctx.businessPortfolioId,
      message_type: ctx.messageType,
      message_body: ctx.messageBody,
    };

    const { data: run, error: runError } = await supabaseAdmin
      .from("automation_runs")
      .insert({
        organization_id: ctx.organizationId,
        automation_rule_id: rule.id,
        conversation_id: ctx.conversationId,
        message_id: ctx.messageId,
        whatsapp_number_id: ctx.whatsappNumberId,
        status: "queued",
        input_payload: inputPayload,
      })
      .select("id")
      .single();
    if (runError || !run?.id) {
      console.error("[AzWA automation] unable to create automation_runs row", runError?.message);
      continue;
    }

    const dedupKey = ctx.messageId
      ? `automation:${rule.id}:${ctx.messageId}`
      : `automation:${rule.id}:${run.id}`;

    const { error: jobError } = await supabaseAdmin.from("jobs").insert({
      organization_id: ctx.organizationId,
      queue_name: AUTOMATION_QUEUE,
      job_type: "run_automation",
      deduplication_key: dedupKey,
      priority: rule.priority,
      payload: { automation_run_id: run.id },
      status: "queued",
    });
    if (jobError) {
      console.error("[AzWA automation] unable to enqueue automation job", jobError.message);
    }
  }
}

export type AutomationRunResult = {
  runId: string;
  status: "completed" | "failed" | "skipped";
  error?: string;
};

async function executeRun(runId: string): Promise<AutomationRunResult> {
  const { data: run } = await supabaseAdmin
    .from("automation_runs")
    .select(
      "id, organization_id, automation_rule_id, conversation_id, message_id, whatsapp_number_id, input_payload",
    )
    .eq("id", runId)
    .maybeSingle();
  if (!run) return { runId, status: "skipped", error: "automation run not found" };

  const { data: rule } = await supabaseAdmin
    .from("automation_rules")
    .select("id, actions, trigger_type, is_enabled")
    .eq("id", run.automation_rule_id)
    .maybeSingle();
  if (!rule || !rule.is_enabled || !run.whatsapp_number_id) {
    await supabaseAdmin
      .from("automation_runs")
      .update({ status: "skipped", completed_at: new Date().toISOString() })
      .eq("id", runId);
    return {
      runId,
      status: "skipped",
      error: !run.whatsapp_number_id
        ? "automation run has no whatsapp_number_id"
        : "rule disabled or deleted since enqueue",
    };
  }

  await supabaseAdmin
    .from("automation_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", runId);

  const input = (run.input_payload ?? {}) as Record<string, unknown>;
  const ctx: AutomationTriggerContext = {
    organizationId: run.organization_id,
    triggerType: rule.trigger_type as TriggerType,
    whatsappNumberId: run.whatsapp_number_id,
    wabaId: String(input["waba_id"] ?? ""),
    businessPortfolioId: (input["business_portfolio_id"] as string | null) ?? null,
    contactId: (input["contact_id"] as string | null) ?? null,
    conversationId: run.conversation_id,
    messageId: run.message_id,
    messageBody: (input["message_body"] as string | null) ?? null,
    messageType: (input["message_type"] as string | null) ?? null,
  };

  const outputs: unknown[] = [];
  let failure: string | null = null;
  for (const action of (rule.actions ?? []) as ActionDef[]) {
    try {
      const result = await executeAction(ctx, action);
      outputs.push(result);
      if (!result.ok && !failure) failure = `${result.type}: ${result.detail ?? "failed"}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "action threw";
      outputs.push({ type: action.type, ok: false, detail: message });
      if (!failure) failure = `${action.type}: ${message}`;
    }
  }

  await supabaseAdmin
    .from("automation_runs")
    .update({
      status: failure ? "failed" : "completed",
      output_payload: JSON.parse(JSON.stringify({ actions: outputs })),
      error: failure,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);

  return failure ? { runId, status: "failed", error: failure } : { runId, status: "completed" };
}

/** Claims and executes queued automation runs. Mirrors drainMediaQueue. */
export async function runAutomationQueue(limit = 20): Promise<AutomationRunResult[]> {
  const { data: jobs, error } = await supabaseAdmin.rpc("backend_claim_jobs", {
    p_worker_id: `automation-worker-${crypto.randomUUID().slice(0, 8)}`,
    p_queue_names: [AUTOMATION_QUEUE],
    p_limit: limit,
  });
  if (error) throw new Error(error.message);

  const results: AutomationRunResult[] = [];
  for (const job of jobs ?? []) {
    const payload = (job.payload ?? {}) as { automation_run_id?: string };
    if (!payload.automation_run_id) {
      await supabaseAdmin.rpc("backend_fail_job", {
        p_job_id: job.id,
        p_error: "job payload is missing automation_run_id",
        p_retry_after_seconds: 0,
      });
      continue;
    }

    try {
      const result = await executeRun(payload.automation_run_id);
      results.push(result);
      if (result.status === "failed") {
        await supabaseAdmin.rpc("backend_fail_job", {
          p_job_id: job.id,
          p_error: result.error ?? "automation run failed",
          p_retry_after_seconds: Math.min(300, 15 * job.attempt),
        });
      } else {
        await supabaseAdmin.rpc("backend_complete_job", { p_job_id: job.id });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unexpected error";
      results.push({ runId: payload.automation_run_id, status: "failed", error: message });

      await supabaseAdmin.rpc("backend_fail_job", {
        p_job_id: job.id,
        p_error: message,
        p_retry_after_seconds: 60,
      });
    }
  }

  return results;
}
