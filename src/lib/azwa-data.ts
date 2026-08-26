import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as SupabaseClient;

export type Portfolio = {
  id: string;
  meta_business_id: string;
  name: string | null;
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
  display_phone_number: string | null;
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

type PortfolioRow = Omit<Portfolio, "health">;
type WabaRow = Omit<Waba, "health">;
type NumberRow = {
  id: string;
  waba_id: string;
  meta_phone_number_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  internal_name: string | null;
  department: string | null;
  country: string | null;
  status: string;
  is_enabled: boolean;
  quality_rating: string | null;
  messaging_limit: string | null;
  webhook_status: string | null;
  last_incoming_message_at: string | null;
  last_outgoing_message_at: string | null;
  last_api_success_at: string | null;
  last_api_failure_at: string | null;
  last_synced_at: string | null;
  wabas: { business_portfolio_id: string };
};
type MessageCounterRow = {
  id: string;
  direction: "incoming" | "outgoing" | "system" | string;
  status: string;
};
type TemplateCounterRow = { status: string };

export function usePortfolios() {
  return useQuery({
    queryKey: ["portfolios"],
    queryFn: async (): Promise<Portfolio[]> => {
      const { data, error } = await db
        .from("business_portfolios")
        .select("id, meta_business_id, name, status, last_synced_at")
        .order("created_at");
      if (error) throw error;
      const rows = (data ?? []) as unknown as PortfolioRow[];
      return rows.map((row) => ({ ...row, health: statusHealth(row.status) }));
    },
  });
}

export function useWabas() {
  return useQuery({
    queryKey: ["wabas"],
    queryFn: async (): Promise<Waba[]> => {
      const { data, error } = await db
        .from("wabas")
        .select("id, business_portfolio_id, meta_waba_id, name, status, last_synced_at")
        .order("meta_waba_id");
      if (error) throw error;
      const rows = (data ?? []) as unknown as WabaRow[];
      return rows.map((row) => ({ ...row, health: statusHealth(row.status) }));
    },
  });
}

export function useNumbers() {
  return useQuery({
    queryKey: ["whatsapp_numbers"],
    queryFn: async (): Promise<WhatsappNumber[]> => {
      const { data, error } = await db
        .from("whatsapp_numbers")
        .select(
          "id, waba_id, meta_phone_number_id, display_phone_number, verified_name, internal_name, department, country, status, is_enabled, quality_rating, messaging_limit, webhook_status, last_incoming_message_at, last_outgoing_message_at, last_api_success_at, last_api_failure_at, last_synced_at, wabas!inner(business_portfolio_id)",
        )
        .order("display_phone_number");
      if (error) throw error;

      const rows = (data ?? []) as unknown as NumberRow[];
      return rows.map((row) => {
        const apiHealth = deriveApiHealth(row.last_api_success_at, row.last_api_failure_at);
        return {
          id: row.id,
          business_portfolio_id: row.wabas.business_portfolio_id,
          waba_id: row.waba_id,
          meta_phone_number_id: row.meta_phone_number_id,
          display_phone_number: row.display_phone_number,
          verified_name: row.verified_name,
          internal_name: row.internal_name,
          department: row.department,
          country: row.country,
          status: row.status,
          enabled: row.is_enabled,
          quality_rating: row.quality_rating,
          messaging_limit: row.messaging_limit,
          webhook_status: row.webhook_status ?? "unknown",
          api_health: apiHealth,
          health: row.status === "active" ? apiHealth : "warning",
          last_incoming_at: row.last_incoming_message_at,
          last_outgoing_at: row.last_outgoing_message_at,
          last_synced_at: row.last_synced_at,
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

      const messagesQuery = db
        .from("messages")
        .select("id, direction, status")
        .gte("created_at", since);
      if (scoped) messagesQuery.in("whatsapp_number_id", numberIds);
      const { data: messages, error: messagesError } = await messagesQuery.limit(5000);
      if (messagesError) throw messagesError;

      const convQuery = db
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");
      if (scoped) convQuery.in("whatsapp_number_id", numberIds);
      const { count: openConversations } = await convQuery;

      const { count: contacts } = await db
        .from("contacts")
        .select("id", { count: "exact", head: true });

      const mediaQuery = db.from("media").select("id", { count: "exact", head: true });
      if (scoped) mediaQuery.in("whatsapp_number_id", numberIds);
      const { count: mediaReceived } = await mediaQuery;

      const { data: templates } = await db.from("templates").select("status");
      const { count: webhookErrors } = await db
        .from("webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed");
      const { count: apiErrors } = await db
        .from("api_errors")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");
      const { count: queueBacklog } = await db
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued");
      const { count: runningCampaigns } = await db
        .from("campaigns")
        .select("id", { count: "exact", head: true })
        .eq("status", "running");

      const rows = (messages ?? []) as unknown as MessageCounterRow[];
      const templateRows = (templates ?? []) as unknown as TemplateCounterRow[];
      return {
        messagesToday: rows.length,
        incoming: rows.filter((message) => message.direction === "incoming").length,
        outgoing: rows.filter((message) => message.direction === "outgoing").length,
        sent: rows.filter((message) => message.status === "sent").length,
        delivered: rows.filter((message) => message.status === "delivered").length,
        read: rows.filter((message) => message.status === "read").length,
        failed: rows.filter((message) => message.status === "failed").length,
        openConversations: openConversations ?? 0,
        contacts: contacts ?? 0,
        mediaReceived: mediaReceived ?? 0,
        templates: templateRows.length,
        approvedTemplates: templateRows.filter((template) => template.status === "approved").length,
        rejectedTemplates: templateRows.filter((template) => template.status === "rejected").length,
        runningCampaigns: runningCampaigns ?? 0,
        webhookErrors: webhookErrors ?? 0,
        apiErrors: apiErrors ?? 0,
        queueBacklog: queueBacklog ?? 0,
      };
    },
  });
}

function statusHealth(status: string): string {
  if (status === "active") return "healthy";
  if (status === "inactive" || status === "missing_from_meta" || status === "requires_review") {
    return "warning";
  }
  return "critical";
}

function deriveApiHealth(lastSuccess: string | null, lastFailure: string | null): string {
  if (!lastSuccess && !lastFailure) return "unknown";
  if (lastFailure && (!lastSuccess || Date.parse(lastFailure) > Date.parse(lastSuccess))) {
    return "critical";
  }
  return "healthy";
}
