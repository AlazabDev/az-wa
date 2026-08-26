import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function enqueueAutomationsForInbound(
  client: SupabaseClient,
  params: {
    organizationId: string;
    whatsappNumberId: string;
    messageId: string;
    conversationId: string;
    contactId: string;
    contactWaId: string;
    message: Record<string, any>;
    mediaId?: string | null;
  },
): Promise<number> {
  const { data: number, error: numberError } = await client
    .from("whatsapp_numbers")
    .select("id,waba_id,wabas!inner(business_portfolio_id)")
    .eq("id", params.whatsappNumberId)
    .single();
  if (numberError || !number) return 0;

  const triggers = ["message.received"];
  if (params.mediaId) triggers.push("media.received");
  if (typeof params.message?.text?.body === "string") triggers.push("keyword.received");

  const { data: rules, error } = await client
    .from("automation_rules")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("is_enabled", true)
    .in("trigger_type", triggers)
    .order("priority", { ascending: true });
  if (error) throw new Error(`Automation rule lookup failed: ${error.message}`);

  let queued = 0;
  for (const rule of rules ?? []) {
    if (rule.scope_whatsapp_number_id && rule.scope_whatsapp_number_id !== params.whatsappNumberId) continue;
    if (rule.scope_waba_id && rule.scope_waba_id !== number.waba_id) continue;
    if (rule.scope_business_portfolio_id && rule.scope_business_portfolio_id !== number.wabas.business_portfolio_id) continue;
    if (!conditionsMatch(rule.conditions, params.message, params.contactWaId, params.whatsappNumberId, number.waba_id)) continue;

    const { data: run, error: runError } = await client.from("automation_runs").insert({
      organization_id: params.organizationId,
      automation_rule_id: rule.id,
      conversation_id: params.conversationId,
      message_id: params.messageId,
      whatsapp_number_id: params.whatsappNumberId,
      status: "queued",
      input_payload: {
        trigger_type: rule.trigger_type,
        contact_id: params.contactId,
        contact_wa_id: params.contactWaId,
        message: params.message,
        media_id: params.mediaId ?? null,
      },
    }).select("id").single();
    if (runError || !run) {
      console.error("automation run insert failed", { rule_id: rule.id, message: runError?.message });
      continue;
    }

    const { error: jobError } = await client.from("jobs").insert({
      organization_id: params.organizationId,
      queue_name: "automation",
      job_type: "run_automation",
      deduplication_key: `automation:${rule.id}:message:${params.messageId}`,
      priority: Number(rule.priority ?? 100),
      payload: { automation_run_id: run.id },
      status: "queued",
      max_attempts: 5,
    });
    if (jobError && jobError.code !== "23505") {
      console.error("automation job insert failed", { rule_id: rule.id, message: jobError.message });
      await client.from("automation_runs").update({ status: "failed", error: jobError.message, completed_at: new Date().toISOString() }).eq("id", run.id);
      continue;
    }
    queued += 1;
  }
  return queued;
}

export async function processAutomationRun(client: SupabaseClient, automationRunId: string): Promise<void> {
  const { data: run, error: runError } = await client
    .from("automation_runs")
    .select("*,automation_rules!inner(*)")
    .eq("id", automationRunId)
    .single();
  if (runError || !run) throw new Error("Automation run not found");
  if (["completed", "skipped", "cancelled"].includes(run.status)) return;

  const rule = run.automation_rules;
  await client.from("automation_runs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", run.id);
  const outputs: unknown[] = [];

  try {
    const actions = Array.isArray(rule.actions) ? rule.actions : [];
    for (let index = 0; index < actions.length; index++) {
      outputs.push(await executeAction(client, run, actions[index], index));
    }
    await client.from("automation_runs").update({
      status: "completed",
      output_payload: { actions: outputs },
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client.from("automation_runs").update({
      status: "failed",
      error: message,
      output_payload: { actions: outputs },
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    return;
  }
}

async function executeAction(client: SupabaseClient, run: any, action: any, actionIndex: number): Promise<unknown> {
  const type = String(action?.type ?? "");
  const input = run.input_payload ?? {};
  switch (type) {
    case "add_tag": {
      const name = String(action.tag ?? action.name ?? "").trim();
      if (!name) throw new Error("add_tag requires tag name");
      const { data: tag, error } = await client.from("tags").upsert({
        organization_id: run.organization_id,
        name,
        category: action.category ?? "automation",
      }, { onConflict: "organization_id,name" }).select("id").single();
      if (error) throw new Error(error.message);
      const { error: linkError } = await client.from("contact_tags").upsert({ contact_id: input.contact_id, tag_id: tag.id }, { onConflict: "contact_id,tag_id" });
      if (linkError) throw new Error(linkError.message);
      return { type, tag: name };
    }
    case "remove_tag": {
      const name = String(action.tag ?? action.name ?? "").trim();
      const { data: tag } = await client.from("tags").select("id").eq("organization_id", run.organization_id).eq("name", name).maybeSingle();
      if (tag?.id) await client.from("contact_tags").delete().eq("contact_id", input.contact_id).eq("tag_id", tag.id);
      return { type, tag: name };
    }
    case "assign_agent": {
      const userId = action.user_id ? String(action.user_id) : null;
      const teamId = action.team_id ? String(action.team_id) : null;
      if (!userId && !teamId) throw new Error("assign_agent requires user_id or team_id");
      await client.from("conversations").update({ assigned_user_id: userId, assigned_team_id: teamId }).eq("id", run.conversation_id);
      const assignmentReason = `automation:${run.id}:action:${actionIndex}`;
      const { data: existing } = await client.from("conversation_assignments").select("id").eq("conversation_id", run.conversation_id).eq("reason", assignmentReason).maybeSingle();
      if (!existing) await client.from("conversation_assignments").insert({
        organization_id: run.organization_id,
        conversation_id: run.conversation_id,
        assigned_user_id: userId,
        assigned_team_id: teamId,
        reason: assignmentReason,
      });
      return { type, user_id: userId, team_id: teamId };
    }
    case "send_message": {
      const recipient = String(input.contact_wa_id ?? "");
      const messageType = String(action.message_type ?? "text");
      const payload = action.payload ?? (messageType === "text" ? { messaging_product: "whatsapp", type: "text", text: { body: String(action.text ?? "") } } : null);
      if (!payload) throw new Error("send_message requires payload");
      const idempotencyKey = `automation:${run.id}:action:${actionIndex}`;
      const { data, error } = await client.rpc("backend_create_outbox", {
        p_whatsapp_number_id: run.whatsapp_number_id,
        p_recipient_address: recipient,
        p_message_type: messageType,
        p_request_payload: payload,
        p_idempotency_key: idempotencyKey,
        p_requested_by: null,
        p_contact_id: input.contact_id ?? null,
        p_conversation_id: run.conversation_id ?? null,
        p_campaign_id: null,
        p_campaign_recipient_id: null,
      });
      if (error) throw new Error(error.message);
      return { type, outbox: data };
    }
    case "send_template": {
      const recipient = String(input.contact_wa_id ?? "");
      const name = String(action.name ?? "");
      const language = String(action.language ?? "en_US");
      if (!name) throw new Error("send_template requires template name");
      const payload = {
        messaging_product: "whatsapp",
        type: "template",
        template: {
          name,
          language: { code: language },
          components: Array.isArray(action.components) ? action.components : [],
        },
      };
      const { data, error } = await client.rpc("backend_create_outbox", {
        p_whatsapp_number_id: run.whatsapp_number_id,
        p_recipient_address: recipient,
        p_message_type: "template",
        p_request_payload: payload,
        p_idempotency_key: `automation:${run.id}:action:${actionIndex}:template:${name}`,
        p_requested_by: null,
        p_contact_id: input.contact_id ?? null,
        p_conversation_id: run.conversation_id ?? null,
        p_campaign_id: null,
        p_campaign_recipient_id: null,
      });
      if (error) throw new Error(error.message);
      return { type, outbox: data };
    }
    case "outgoing_webhook": {
      const webhookId = String(action.webhook_id ?? "");
      if (!webhookId) throw new Error("outgoing_webhook requires webhook_id");
      const eventType = String(action.event_type ?? "automation.action");
      const payload = { automation_run_id: run.id, rule_id: ruleId(run), input, action };
      const { data, error } = await client.rpc("backend_enqueue_outgoing_webhook", {
        p_organization_id: run.organization_id,
        p_outgoing_webhook_id: webhookId,
        p_event_type: eventType,
        p_event_id: run.id,
        p_payload: payload,
      });
      if (error) throw new Error(error.message);
      return { type, delivery: data };
    }
    default:
      throw new Error(`Unsupported automation action: ${type}`);
  }
}

function ruleId(run: any): string | null {
  return run.automation_rule_id ?? null;
}

function conditionsMatch(conditions: unknown, message: any, waId: string, numberId: string, wabaId: string): boolean {
  if (!Array.isArray(conditions) || conditions.length === 0) return true;
  const ctx: Record<string, unknown> = {
    "message.type": message?.type,
    "message.body": message?.text?.body ?? message?.button?.text ?? null,
    "contact.wa_id": waId,
    "number.id": numberId,
    "waba.id": wabaId,
  };
  return conditions.every((c: any) => {
    const actual = ctx[String(c?.field ?? "")];
    const expected = c?.value;
    switch (String(c?.operator ?? "eq")) {
      case "eq": return String(actual ?? "") === String(expected ?? "");
      case "neq": return String(actual ?? "") !== String(expected ?? "");
      case "contains": return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
      case "starts_with": return String(actual ?? "").toLowerCase().startsWith(String(expected ?? "").toLowerCase());
      case "in": return Array.isArray(expected) && expected.map(String).includes(String(actual ?? ""));
      default: return false;
    }
  });
}
