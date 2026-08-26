import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Portfolio = {
  id: string;
  meta_business_id: string;
  name: string;
  status: string;
  health: string;
  last_synced_at: string | null;
};

export type Waba = {
  id: string;
  business_portfolio_id: string;
  meta_waba_id: string;
  name: string | null;
  status: string;
  health: string;
  last_synced_at: string | null;
};

export type WhatsappNumber = {
  id: string;
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
  api_health: string;
  health: string;
  last_incoming_at: string | null;
  last_outgoing_at: string | null;
  last_synced_at: string | null;
};

export function usePortfolios() {
  return useQuery({
    queryKey: ["portfolios"],
    queryFn: async (): Promise<Portfolio[]> => {
      const { data, error } = await supabase
        .from("business_portfolios")
        .select("id, meta_business_id, name, status, health, last_synced_at")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWabas() {
  return useQuery({
    queryKey: ["wabas"],
    queryFn: async (): Promise<Waba[]> => {
      const { data, error } = await supabase
        .from("wabas")
        .select("id, business_portfolio_id, meta_waba_id, name, status, health, last_synced_at")
        .order("meta_waba_id");
      if (error) throw error;
      return data ?? [];
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
          "id, business_portfolio_id, waba_id, meta_phone_number_id, display_phone_number, verified_name, internal_name, department, country, status, enabled, quality_rating, messaging_limit, webhook_status, api_health, health, last_incoming_at, last_outgoing_at, last_synced_at",
        )
        .order("display_phone_number");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useOpsCounters(numberIds: string[]) {
  return useQuery({
    queryKey: ["ops-counters", numberIds.slice().sort().join(",")],
    queryFn: async () => {
      const scoped = numberIds.length > 0;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const countOf = async (
        table: "messages" | "conversations" | "contacts" | "media" | "templates",
        build?: (q: ReturnType<typeof supabase.from>) => unknown,
      ) => build && table && 0;
      void countOf;

      const messagesQuery = supabase
        .from("messages")
        .select("id, direction, status", { count: "exact" })
        .gte("timestamp", since);
      if (scoped) messagesQuery.in("whatsapp_number_id", numberIds);
      const { data: messages } = await messagesQuery.limit(5000);

      const convQuery = supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");
      if (scoped) convQuery.in("whatsapp_number_id", numberIds);
      const { count: openConversations } = await convQuery;

      const { count: contacts } = await supabase
        .from("contacts")
        .select("id", { count: "exact", head: true });

      const mediaQuery = supabase.from("media").select("id", { count: "exact", head: true });
      if (scoped) mediaQuery.in("whatsapp_number_id", numberIds);
      const { count: mediaReceived } = await mediaQuery;

      const { data: templates } = await supabase.from("templates").select("status");

      const { count: webhookErrors } = await supabase
        .from("webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed");

      const { count: apiErrors } = await supabase
        .from("api_errors")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");

      const { count: queueBacklog } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      const { count: runningCampaigns } = await supabase
        .from("campaigns")
        .select("id", { count: "exact", head: true })
        .eq("status", "running");

      const rows = messages ?? [];
      return {
        messagesToday: rows.length,
        incoming: rows.filter((m) => m.direction === "inbound").length,
        outgoing: rows.filter((m) => m.direction === "outbound").length,
        sent: rows.filter((m) => m.status === "sent").length,
        delivered: rows.filter((m) => m.status === "delivered").length,
        read: rows.filter((m) => m.status === "read").length,
        failed: rows.filter((m) => m.status === "failed").length,
        openConversations: openConversations ?? 0,
        contacts: contacts ?? 0,
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
  });
}
