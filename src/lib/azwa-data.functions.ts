import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ServerHealth = "healthy" | "warning" | "critical" | "unknown";

export type ServerPortfolio = {
  id: string;
  organization_id: string;
  meta_business_id: string;
  name: string;
  status: string;
  health: ServerHealth;
  last_synced_at: string | null;
};

export type ServerWaba = {
  id: string;
  organization_id: string;
  business_portfolio_id: string;
  meta_waba_id: string;
  name: string | null;
  status: string;
  health: ServerHealth;
  last_synced_at: string | null;
};

export type ServerNumber = {
  id: string;
  organization_id: string;
  business_portfolio_id: string;
  waba_id: string;
  meta_phone_number_id: string;
  display_phone_number: string;
  verified_name: string | null;
  internal_name: string | null;
  department: string | null;
  country: string | null;
  status: string;
  enabled: boolean;
  quality_rating: string | null;
  messaging_limit: string | null;
  webhook_status: string;
  api_health: ServerHealth;
  health: ServerHealth;
  last_incoming_at: string | null;
  last_outgoing_at: string | null;
  last_synced_at: string | null;
};

export type ServerInventory = {
  portfolios: ServerPortfolio[];
  wabas: ServerWaba[];
  numbers: ServerNumber[];
};

export type OpsCounters = {
  messagesToday: number;
  incoming: number;
  outgoing: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  openConversations: number;
  contacts: number;
  mediaReceived: number;
  templates: number;
  approvedTemplates: number;
  rejectedTemplates: number;
  runningCampaigns: number;
  webhookErrors: number;
  apiErrors: number;
  queueBacklog: number;
};

const OK_STATUS = new Set(["connected", "active", "verified", "approved"]);

function statusHealth(status: string, lastSyncedAt: string | null): ServerHealth {
  const value = status.toLowerCase();
  if (!OK_STATUS.has(value)) {
    return value === "missing" || value === "disabled" || value === "disconnected"
      ? "critical"
      : "warning";
  }
  return lastSyncedAt ? "healthy" : "unknown";
}

function apiHealthOf(successAt: string | null, failureAt: string | null): ServerHealth {
  if (!successAt && !failureAt) return "unknown";
  if (failureAt && (!successAt || new Date(failureAt) > new Date(successAt))) return "critical";
  return "healthy";
}

function numberHealth(input: {
  status: string;
  isEnabled: boolean;
  qualityRating: string | null;
  webhookStatus: string | null;
  api: ServerHealth;
}): ServerHealth {
  if (!input.isEnabled || input.status.toLowerCase() === "disconnected") return "critical";
  if (input.api === "critical") return "critical";
  if (!OK_STATUS.has(input.status.toLowerCase())) return "warning";
  const quality = (input.qualityRating ?? "").toUpperCase();
  if (quality === "RED") return "critical";
  if (quality === "YELLOW") return "warning";
  if ((input.webhookStatus ?? "unknown") !== "active") return "warning";
  return input.api === "unknown" ? "unknown" : "healthy";
}

async function organizationAndPermission(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  permission: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: organization, error } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("slug", "alazab-group")
    .maybeSingle();
  if (error || !organization?.id) throw new Error(error?.message ?? "AzWA organization not found");

  const { data: allowed, error: permissionError } = await context.supabase.rpc(
    "azwa_has_org_permission",
    { p_org_id: organization.id, p_permission: permission },
  );
  if (permissionError || !allowed) throw new Error("Forbidden");
  return organization.id as string;
}

export const getAzwaInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: Record<string, never>) => input)
  .handler(async ({ context }): Promise<ServerInventory> => {
    const organizationId = await organizationAndPermission(context, "business.read");
    const { supabaseRuntimeAdmin } = await import("@/integrations/supabase/client.server");

    const [portfolioResult, wabaResult, numberResult] = await Promise.all([
      supabaseRuntimeAdmin
        .from("business_portfolios")
        .select("id, organization_id, meta_business_id, name, status, last_synced_at")
        .eq("organization_id", organizationId)
        .order("created_at"),
      supabaseRuntimeAdmin
        .from("wabas")
        .select(
          "id, organization_id, business_portfolio_id, meta_waba_id, name, status, last_synced_at",
        )
        .eq("organization_id", organizationId)
        .order("meta_waba_id"),
      supabaseRuntimeAdmin
        .from("whatsapp_numbers")
        .select(
          "id, organization_id, waba_id, meta_phone_number_id, display_phone_number, verified_name, internal_name, department, country, status, is_enabled, quality_rating, messaging_limit, webhook_status, last_api_success_at, last_api_failure_at, last_incoming_message_at, last_outgoing_message_at, last_synced_at, wabas(business_portfolio_id)",
        )
        .eq("organization_id", organizationId)
        .order("display_phone_number"),
    ]);

    if (portfolioResult.error) throw new Error(portfolioResult.error.message);
    if (wabaResult.error) throw new Error(wabaResult.error.message);
    if (numberResult.error) throw new Error(numberResult.error.message);

    const portfolios: ServerPortfolio[] = (portfolioResult.data ?? []).map((row) => ({
      id: String(row.id),
      organization_id: String(row.organization_id),
      meta_business_id: String(row.meta_business_id),
      name: String(row.name ?? row.meta_business_id),
      status: String(row.status),
      health: statusHealth(String(row.status), row.last_synced_at ?? null),
      last_synced_at: row.last_synced_at ?? null,
    }));

    const wabas: ServerWaba[] = (wabaResult.data ?? []).map((row) => ({
      id: String(row.id),
      organization_id: String(row.organization_id),
      business_portfolio_id: String(row.business_portfolio_id),
      meta_waba_id: String(row.meta_waba_id),
      name: row.name ?? null,
      status: String(row.status),
      health: statusHealth(String(row.status), row.last_synced_at ?? null),
      last_synced_at: row.last_synced_at ?? null,
    }));

    const numbers: ServerNumber[] = (numberResult.data ?? []).map((row) => {
      const api = apiHealthOf(row.last_api_success_at ?? null, row.last_api_failure_at ?? null);
      const relatedWaba = Array.isArray(row.wabas) ? row.wabas[0] : row.wabas;
      return {
        id: String(row.id),
        organization_id: String(row.organization_id),
        business_portfolio_id: String(relatedWaba?.business_portfolio_id ?? ""),
        waba_id: String(row.waba_id),
        meta_phone_number_id: String(row.meta_phone_number_id),
        display_phone_number: String(row.display_phone_number ?? row.meta_phone_number_id),
        verified_name: row.verified_name ?? null,
        internal_name: row.internal_name ?? null,
        department: row.department ?? null,
        country: row.country ?? null,
        status: String(row.status),
        enabled: Boolean(row.is_enabled),
        quality_rating: row.quality_rating ?? null,
        messaging_limit: row.messaging_limit ?? null,
        webhook_status: row.webhook_status ?? "unknown",
        api_health: api,
        health: numberHealth({
          status: String(row.status),
          isEnabled: Boolean(row.is_enabled),
          qualityRating: row.quality_rating ?? null,
          webhookStatus: row.webhook_status ?? null,
          api,
        }),
        last_incoming_at: row.last_incoming_message_at ?? null,
        last_outgoing_at: row.last_outgoing_message_at ?? null,
        last_synced_at: row.last_synced_at ?? null,
      };
    });

    return { portfolios, wabas, numbers };
  });

export const getAzwaOpsCounters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { numberIds: string[] }) => input)
  .handler(async ({ data, context }): Promise<OpsCounters> => {
    const organizationId = await organizationAndPermission(context, "messages.read");
    const { supabaseRuntimeAdmin } = await import("@/integrations/supabase/client.server");

    const requestedIds = [
      ...new Set((data.numberIds ?? []).filter((value) => /^[0-9a-f-]{36}$/i.test(value))),
    ];
    let allowedNumberIds: string[] = [];
    if (requestedIds.length > 0) {
      const { data: rows, error } = await supabaseRuntimeAdmin
        .from("whatsapp_numbers")
        .select("id")
        .eq("organization_id", organizationId)
        .in("id", requestedIds);
      if (error) throw new Error(error.message);
      allowedNumberIds = (rows ?? []).map((row) => String(row.id));
    }

    const scoped = requestedIds.length > 0;
    if (scoped && allowedNumberIds.length !== requestedIds.length)
      throw new Error("Invalid number scope");
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    async function countMessages(filters?: { direction?: string; status?: string }) {
      let query = supabaseRuntimeAdmin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", since);
      if (scoped) query = query.in("whatsapp_number_id", allowedNumberIds);
      if (filters?.direction) query = query.eq("direction", filters.direction);
      if (filters?.status) query = query.eq("status", filters.status);
      const { count, error } = await query;
      if (error) throw new Error(error.message);
      return count ?? 0;
    }

    const [messagesToday, incoming, outgoing, sent, delivered, read, failed] = await Promise.all([
      countMessages(),
      countMessages({ direction: "incoming" }),
      countMessages({ direction: "outgoing" }),
      countMessages({ status: "sent" }),
      countMessages({ status: "delivered" }),
      countMessages({ status: "read" }),
      countMessages({ status: "failed" }),
    ]);

    let conversationQuery = supabaseRuntimeAdmin
      .from("conversations")
      .select("id, contact_id", { count: "exact" })
      .eq("organization_id", organizationId)
      .eq("status", "open")
      .limit(10_000);
    if (scoped) conversationQuery = conversationQuery.in("whatsapp_number_id", allowedNumberIds);
    const conversationResult = await conversationQuery;
    if (conversationResult.error) throw new Error(conversationResult.error.message);
    const openConversations = conversationResult.count ?? 0;

    let contacts: number;
    if (scoped) {
      contacts = new Set(
        (conversationResult.data ?? []).map((row) => row.contact_id).filter(Boolean),
      ).size;
    } else {
      const result = await supabaseRuntimeAdmin
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId);
      if (result.error) throw new Error(result.error.message);
      contacts = result.count ?? 0;
    }

    let mediaQuery = supabaseRuntimeAdmin
      .from("media")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", since);
    if (scoped) mediaQuery = mediaQuery.in("whatsapp_number_id", allowedNumberIds);
    const mediaResult = await mediaQuery;
    if (mediaResult.error) throw new Error(mediaResult.error.message);

    let scopedWabaIds: string[] = [];
    if (scoped) {
      const { data: numberRows, error } = await supabaseRuntimeAdmin
        .from("whatsapp_numbers")
        .select("waba_id")
        .eq("organization_id", organizationId)
        .in("id", allowedNumberIds);
      if (error) throw new Error(error.message);
      scopedWabaIds = [...new Set((numberRows ?? []).map((row) => String(row.waba_id)))];
    }

    let templatesQuery = supabaseRuntimeAdmin
      .from("templates")
      .select("status")
      .eq("organization_id", organizationId);
    if (scoped) templatesQuery = templatesQuery.in("waba_id", scopedWabaIds);
    const templatesResult = await templatesQuery;
    if (templatesResult.error) throw new Error(templatesResult.error.message);
    const templates = templatesResult.data ?? [];

    let webhookErrorQuery = supabaseRuntimeAdmin
      .from("webhook_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "failed")
      .gte("created_at", since);
    if (scoped) webhookErrorQuery = webhookErrorQuery.in("whatsapp_number_id", allowedNumberIds);

    let apiErrorQuery = supabaseRuntimeAdmin
      .from("api_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("http_status", 400)
      .gte("created_at", since);
    if (scoped) apiErrorQuery = apiErrorQuery.in("whatsapp_number_id", allowedNumberIds);

    const [webhookErrorResult, apiErrorResult, queueResult, campaignResult] = await Promise.all([
      webhookErrorQuery,
      apiErrorQuery,
      supabaseRuntimeAdmin
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "queued"),
      supabaseRuntimeAdmin
        .from("campaigns")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "running"),
    ]);

    for (const result of [webhookErrorResult, apiErrorResult, queueResult, campaignResult]) {
      if (result.error) throw new Error(result.error.message);
    }

    return {
      messagesToday,
      incoming,
      outgoing,
      sent,
      delivered,
      read,
      failed,
      openConversations,
      contacts,
      mediaReceived: mediaResult.count ?? 0,
      templates: templates.length,
      approvedTemplates: templates.filter((row) => String(row.status).toLowerCase() === "approved")
        .length,
      rejectedTemplates: templates.filter((row) => String(row.status).toLowerCase() === "rejected")
        .length,
      runningCampaigns: campaignResult.count ?? 0,
      webhookErrors: webhookErrorResult.count ?? 0,
      apiErrors: apiErrorResult.count ?? 0,
      queueBacklog: queueResult.count ?? 0,
    };
  });
