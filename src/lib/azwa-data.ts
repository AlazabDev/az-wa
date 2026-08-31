import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Health = "healthy" | "warning" | "critical" | "unknown";

export type Portfolio = {
  id: string;
  organization_id: string;
  meta_business_id: string;
  name: string;
  status: string;
  health: Health;
  last_synced_at: string | null;
};

export type Waba = {
  id: string;
  organization_id: string;
  business_portfolio_id: string;
  meta_waba_id: string;
  name: string | null;
  status: string;
  health: Health;
  last_synced_at: string | null;
};

export type WhatsappNumber = {
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
  api_health: Health;
  health: Health;
  last_incoming_at: string | null;
  last_outgoing_at: string | null;
  last_synced_at: string | null;
};

const OK_STATUS = ["connected", "active", "verified", "approved"];

function statusHealth(status: string, lastSyncedAt: string | null): Health {
  if (!OK_STATUS.includes(status.toLowerCase())) {
    return status.toLowerCase() === "missing" || status.toLowerCase() === "disabled"
      ? "critical"
      : "warning";
  }
  return lastSyncedAt ? "healthy" : "unknown";
}

function apiHealthOf(successAt: string | null, failureAt: string | null): Health {
  if (!successAt && !failureAt) return "unknown";
  if (failureAt && (!successAt || new Date(failureAt) > new Date(successAt))) return "critical";
  return "healthy";
}

function numberHealth(n: {
  status: string;
  is_enabled: boolean;
  quality_rating: string | null;
  webhook_status: string | null;
  api: Health;
}): Health {
  if (!n.is_enabled) return "critical";
  if (n.api === "critical") return "critical";
  if (!OK_STATUS.includes(n.status.toLowerCase())) return "warning";
  const q = (n.quality_rating ?? "").toUpperCase();
  if (q === "RED") return "critical";
  if (q === "YELLOW") return "warning";
  if ((n.webhook_status ?? "unknown") !== "active") return "warning";
  return n.api === "unknown" ? "unknown" : "healthy";
}

export function usePortfolios() {
  return useQuery({
    queryKey: ["portfolios"],
    queryFn: async (): Promise<Portfolio[]> => {
      const { data, error } = await supabase
        .from("business_portfolios")
        .select("id, organization_id, meta_business_id, name, status, last_synced_at")
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id,
        organization_id: p.organization_id,
        meta_business_id: p.meta_business_id,
        name: p.name ?? p.meta_business_id,
        status: p.status,
        health: statusHealth(p.status, p.last_synced_at),
        last_synced_at: p.last_synced_at,
      }));
    },
  });
}

export function useWabas() {
  return useQuery({
    queryKey: ["wabas"],
    queryFn: async (): Promise<Waba[]> => {
      const { data, error } = await supabase
        .from("wabas")
        .select(
          "id, organization_id, business_portfolio_id, meta_waba_id, name, status, last_synced_at",
        )
        .order("meta_waba_id");
      if (error) throw error;
      return (data ?? []).map((w) => ({
        id: w.id,
        organization_id: w.organization_id,
        business_portfolio_id: w.business_portfolio_id,
        meta_waba_id: w.meta_waba_id,
        name: w.name,
        status: w.status,
        health: statusHealth(w.status, w.last_synced_at),
        last_synced_at: w.last_synced_at,
      }));
    },
  });
}

export function useNumbers() {
  return useQuery({
    queryKey: ["whatsapp_numbers"],
    queryFn: async (): Promise<WhatsappNumber[]> => {
      const { data, error } = await supabase
        .from("whatsapp_numbers")
        .select(
          "id, organization_id, waba_id, meta_phone_number_id, display_phone_number, verified_name, internal_name, department, country, status, is_enabled, quality_rating, messaging_limit, webhook_status, last_api_success_at, last_api_failure_at, last_incoming_message_at, last_outgoing_message_at, last_synced_at, wabas(business_portfolio_id)",
        )
        .order("display_phone_number");
      if (error) throw error;
      return (data ?? []).map((n) => {
        const api = apiHealthOf(n.last_api_success_at, n.last_api_failure_at);
        return {
          id: n.id,
          organization_id: n.organization_id,
          business_portfolio_id: n.wabas?.business_portfolio_id ?? "",
          waba_id: n.waba_id,
          meta_phone_number_id: n.meta_phone_number_id,
          display_phone_number: n.display_phone_number ?? n.meta_phone_number_id,
          verified_name: n.verified_name,
          internal_name: n.internal_name,
          department: n.department,
          country: n.country,
          status: n.status,
          enabled: n.is_enabled,
          quality_rating: n.quality_rating,
          messaging_limit: n.messaging_limit,
          webhook_status: n.webhook_status ?? "unknown",
          api_health: api,
          health: numberHealth({
            status: n.status,
            is_enabled: n.is_enabled,
            quality_rating: n.quality_rating,
            webhook_status: n.webhook_status,
            api,
          }),
          last_incoming_at: n.last_incoming_message_at,
          last_outgoing_at: n.last_outgoing_message_at,
          last_synced_at: n.last_synced_at,
        };
      });
    },
  });
}

export function useOpsCounters(numberIds: string[]) {
  return useQuery({
    queryKey: ["ops-counters", numberIds.slice().sort().join(",")],
    queryFn: async () => {
      const scoped = numberIds.length > 0;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const countMessages = async (filters?: { direction?: string; status?: string }) => {
        let query = supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since);
        if (scoped) query = query.in("whatsapp_number_id", numberIds);
        if (filters?.direction) query = query.eq("direction", filters.direction);
        if (filters?.status) query = query.eq("status", filters.status);
        const { count, error } = await query;
        if (error) throw error;
        return count ?? 0;
      };

      const [messagesToday, incoming, outgoing, sent, delivered, read, failed] = await Promise.all([
        countMessages(),
        countMessages({ direction: "incoming" }),
        countMessages({ direction: "outgoing" }),
        countMessages({ status: "sent" }),
        countMessages({ status: "delivered" }),
        countMessages({ status: "read" }),
        countMessages({ status: "failed" }),
      ]);

      let convQuery = supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");
      if (scoped) convQuery = convQuery.in("whatsapp_number_id", numberIds);
      const { count: openConversations, error: convError } = await convQuery;
      if (convError) throw convError;

      let contacts = 0;
      if (scoped) {
        const { data: contactRows, error: contactError } = await supabase
          .from("conversations")
          .select("contact_id")
          .in("whatsapp_number_id", numberIds)
          .not("contact_id", "is", null)
          .limit(10000);
        if (contactError) throw contactError;
        contacts = new Set((contactRows ?? []).map((row) => row.contact_id).filter(Boolean)).size;
      } else {
        const { count, error } = await supabase
          .from("contacts")
          .select("id", { count: "exact", head: true });
        if (error) throw error;
        contacts = count ?? 0;
      }

      let mediaQuery = supabase.from("media").select("id", { count: "exact", head: true });
      if (scoped) mediaQuery = mediaQuery.in("whatsapp_number_id", numberIds);
      const { count: mediaReceived, error: mediaError } = await mediaQuery;
      if (mediaError) throw mediaError;

      let scopedWabaIds: string[] = [];
      if (scoped) {
        const { data: numberRows, error: numberError } = await supabase
          .from("whatsapp_numbers")
          .select("waba_id")
          .in("id", numberIds);
        if (numberError) throw numberError;
        scopedWabaIds = [...new Set((numberRows ?? []).map((row) => row.waba_id).filter(Boolean))];
      }

      let templatesQuery = supabase.from("templates").select("status");
      if (scoped && scopedWabaIds.length > 0)
        templatesQuery = templatesQuery.in("waba_id", scopedWabaIds);
      const { data: templates, error: templateError } = await templatesQuery;
      if (templateError) throw templateError;

      let webhookQuery = supabase
        .from("webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed");
      if (scoped) webhookQuery = webhookQuery.in("whatsapp_number_id", numberIds);
      const { count: webhookErrors, error: webhookError } = await webhookQuery;
      if (webhookError) throw webhookError;

      let apiErrorQuery = supabase
        .from("api_errors")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");
      if (scoped) apiErrorQuery = apiErrorQuery.in("whatsapp_number_id", numberIds);
      const { count: apiErrors, error: apiError } = await apiErrorQuery;
      if (apiError) throw apiError;

      const { count: queueBacklog, error: queueError } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued");
      if (queueError) throw queueError;

      let campaignQuery = supabase
        .from("campaigns")
        .select("id", { count: "exact", head: true })
        .eq("status", "running");
      if (scoped) campaignQuery = campaignQuery.in("sender_whatsapp_number_id", numberIds);
      const { count: runningCampaigns, error: campaignError } = await campaignQuery;
      if (campaignError) throw campaignError;

      return {
        messagesToday,
        incoming,
        outgoing,
        sent,
        delivered,
        read,
        failed,
        openConversations: openConversations ?? 0,
        contacts,
        mediaReceived: mediaReceived ?? 0,
        templates: templates?.length ?? 0,
        approvedTemplates: (templates ?? []).filter((t) => t.status === "APPROVED").length,
        rejectedTemplates: (templates ?? []).filter((t) => t.status === "REJECTED").length,
        runningCampaigns: runningCampaigns ?? 0,
        webhookErrors: webhookErrors ?? 0,
        apiErrors: apiErrors ?? 0,
        queueBacklog: queueBacklog ?? 0,
      };
    },
    refetchInterval: 30_000,
  });
}
