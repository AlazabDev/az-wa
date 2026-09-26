/**
 * Campaign management server functions.
 * Create, schedule, launch and cancel broadcast campaigns.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

export type CampaignRow = {
  id: string;
  organization_id: string;
  name: string;
  status: CampaignStatus;
  sender_whatsapp_number_id: string | null;
  template_id: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  stats: Record<string, number> | null;
  created_at: string;
  updated_at: string | null;
  template_components: Record<string, unknown>[] | null;
};

export type CreateCampaignInput = {
  name: string;
  senderNumberId: string;
  templateId: string;
  /** Phone numbers to send to — one per line or comma-separated. */
  recipientsRaw: string;
  /** ISO datetime string or null for immediate send */
  scheduledAt: string | null;
  /** Pre-filled template runtime components */
  templateComponents: Record<string, unknown>[];
};

export type CampaignListItem = {
  id: string;
  name: string;
  status: CampaignStatus;
  senderNumberId: string | null;
  templateId: string | null;
  templateName: string | null;
  recipientCount: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  stats: Record<string, number> | null;
  createdAt: string;
};

async function authorize(context: any, permission = "campaigns.manage") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: org, error } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("slug", "alazab-group")
    .maybeSingle();
  if (error || !org?.id) throw new Error(error?.message ?? "Organization not found");

  const { data: allowed, error: permError } = await context.supabase.rpc(
    "azwa_has_org_permission",
    { p_org_id: org.id, p_permission: permission },
  );
  if (permError || !allowed) throw new Error("Forbidden");
  return { organizationId: org.id as string, supabaseAdmin };
}

function parseRecipients(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((r) => r.replace(/[^0-9]/g, "").trim())
    .filter((r) => r.length >= 7 && r.length <= 20);
}

/** List campaigns with per-campaign recipient count. */
export const listCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { page?: number; limit?: number }) => input ?? {})
  .handler(async ({ data, context }): Promise<{ campaigns: CampaignListItem[]; total: number }> => {
    const { organizationId, supabaseAdmin } = await authorize(context, "campaigns.read");
    const { supabaseRuntimeAdmin } = await import("@/integrations/supabase/client.server");

    const pageSize = Math.min(100, Math.max(10, data.limit ?? 50));
    const page = Math.max(1, data.page ?? 1);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data: rows, count, error } = await (supabaseRuntimeAdmin as any)
      .from("campaigns")
      .select("*", { count: "exact" })
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(error.message);

    const campaignIds = (rows ?? []).map((r: any) => r.id as string);
    let recipientCounts: Record<string, number> = {};

    if (campaignIds.length > 0) {
      const { data: rcRows, error: rcError } = await (supabaseRuntimeAdmin as any)
        .from("campaign_recipients")
        .select("campaign_id")
        .in("campaign_id", campaignIds);
      if (!rcError && rcRows) {
        for (const row of rcRows) {
          const cid = row.campaign_id as string;
          recipientCounts[cid] = (recipientCounts[cid] ?? 0) + 1;
        }
      }
    }

    // Fetch template names
    let templateNames: Record<string, string> = {};
    const templateIds = [
      ...new Set((rows ?? []).map((r: any) => r.template_id).filter(Boolean) as string[]),
    ];
    if (templateIds.length > 0) {
      const { data: tplRows } = await supabaseAdmin
        .from("templates")
        .select("id, name")
        .in("id", templateIds);
      for (const tpl of tplRows ?? []) {
        templateNames[tpl.id] = tpl.name;
      }
    }

    const campaigns: CampaignListItem[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      status: r.status as CampaignStatus,
      senderNumberId: r.sender_whatsapp_number_id ?? null,
      templateId: r.template_id ?? null,
      templateName: r.template_id ? (templateNames[r.template_id] ?? null) : null,
      recipientCount: recipientCounts[r.id] ?? 0,
      scheduledAt: r.scheduled_at ?? null,
      startedAt: r.started_at ?? null,
      completedAt: r.completed_at ?? null,
      stats: r.stats ?? null,
      createdAt: r.created_at,
    }));

    return { campaigns, total: count ?? 0 };
  });

/** Create a campaign with recipients. Does not send — creates as draft or schedules. */
export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreateCampaignInput) => input)
  .handler(async ({ data, context }): Promise<{ ok: true; campaignId: string }> => {
    const { organizationId, supabaseAdmin } = await authorize(context);
    const { supabaseRuntimeAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.name.trim()) throw new Error("Campaign name is required");
    if (!data.senderNumberId) throw new Error("Sender number is required");
    if (!data.templateId) throw new Error("Template is required");

    const recipients = parseRecipients(data.recipientsRaw);
    if (recipients.length === 0) throw new Error("At least one valid recipient is required");
    if (recipients.length > 10_000) throw new Error("Maximum 10,000 recipients per campaign");

    // Verify number belongs to org
    const { data: number, error: numError } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("id, is_enabled, status")
      .eq("id", data.senderNumberId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (numError || !number) throw new Error("Sender number not found");
    if (!number.is_enabled || number.status !== "active")
      throw new Error("Sender number is not active");

    // Verify template
    const { data: template, error: tplError } = await supabaseAdmin
      .from("templates")
      .select("id, status, waba_id")
      .eq("id", data.templateId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (tplError || !template) throw new Error("Template not found");
    if (String(template.status).toLowerCase() !== "approved")
      throw new Error("Only approved templates can be used in campaigns");

    const now = new Date().toISOString();
    const status: CampaignStatus = data.scheduledAt ? "scheduled" : "draft";

    const { data: campaign, error: campError } = await (supabaseRuntimeAdmin as any)
      .from("campaigns")
      .insert({
        organization_id: organizationId,
        name: data.name.trim(),
        status,
        sender_whatsapp_number_id: data.senderNumberId,
        template_id: data.templateId,
        scheduled_at: data.scheduledAt ?? null,
        template_components: data.templateComponents.length > 0 ? data.templateComponents : null,
        stats: { total: recipients.length, sent: 0, delivered: 0, read: 0, failed: 0 },
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (campError || !campaign?.id) throw new Error(campError?.message ?? "Failed to create campaign");
    const campaignId = String(campaign.id);

    // Insert recipients in batches of 500
    const BATCH = 500;
    for (let i = 0; i < recipients.length; i += BATCH) {
      const batch = recipients.slice(i, i + BATCH).map((phone) => ({
        organization_id: organizationId,
        campaign_id: campaignId,
        recipient_address: phone,
        status: "queued",
        created_at: now,
      }));
      const { error: rcError } = await (supabaseRuntimeAdmin as any)
        .from("campaign_recipients")
        .insert(batch);
      if (rcError) throw new Error(`Failed to add recipients: ${rcError.message}`);
    }

    return { ok: true, campaignId };
  });

/** Launch a draft campaign immediately. */
export const launchCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { campaignId: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true; queued: number }> => {
    const { organizationId, supabaseAdmin } = await authorize(context);
    const { supabaseRuntimeAdmin } = await import("@/integrations/supabase/client.server");

    const { data: campaign, error: campError } = await (supabaseRuntimeAdmin as any)
      .from("campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (campError || !campaign) throw new Error("Campaign not found");
    if (!["draft", "scheduled"].includes(campaign.status))
      throw new Error(`Cannot launch campaign in status: ${campaign.status}`);

    // Mark campaign running
    await (supabaseRuntimeAdmin as any)
      .from("campaigns")
      .update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", data.campaignId);

    // Get queued recipients
    const { data: recipients, error: rcError } = await (supabaseRuntimeAdmin as any)
      .from("campaign_recipients")
      .select("id, recipient_address")
      .eq("campaign_id", data.campaignId)
      .eq("status", "queued")
      .limit(10000);

    if (rcError) throw new Error(rcError.message);

    const templateComponents = Array.isArray(campaign.template_components)
      ? campaign.template_components
      : [];

    // Queue one job per recipient
    const now = new Date().toISOString();
    const BATCH = 200;
    const recips = recipients ?? [];
    for (let i = 0; i < recips.length; i += BATCH) {
      const batch = recips.slice(i, i + BATCH).map((r: any) => ({
        organization_id: organizationId,
        queue_name: "campaign-send",
        job_type: "send_campaign_message",
        deduplication_key: `campaign:${data.campaignId}:${r.id}`,
        priority: 5,
        payload: {
          campaign_id: data.campaignId,
          recipient_id: r.id,
          recipient_address: r.recipient_address,
          sender_number_id: campaign.sender_whatsapp_number_id,
          template_id: campaign.template_id,
          template_components: templateComponents,
        },
        status: "queued",
        max_attempts: 3,
        created_at: now,
      }));
      await (supabaseRuntimeAdmin as any).from("jobs").insert(batch);
    }

    return { ok: true, queued: recips.length };
  });

/** Cancel a running or scheduled campaign. */
export const cancelCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { campaignId: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { organizationId } = await authorize(context);
    const { supabaseRuntimeAdmin } = await import("@/integrations/supabase/client.server");

    const { data: campaign, error } = await (supabaseRuntimeAdmin as any)
      .from("campaigns")
      .select("id, status")
      .eq("id", data.campaignId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error || !campaign) throw new Error("Campaign not found");
    if (campaign.status === "completed") throw new Error("Cannot cancel a completed campaign");

    await (supabaseRuntimeAdmin as any)
      .from("campaigns")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", data.campaignId);

    // Cancel queued jobs
    await (supabaseRuntimeAdmin as any)
      .from("jobs")
      .update({ status: "cancelled" })
      .eq("organization_id", organizationId)
      .eq("queue_name", "campaign-send")
      .contains("payload", { campaign_id: data.campaignId })
      .eq("status", "queued");

    return { ok: true };
  });
