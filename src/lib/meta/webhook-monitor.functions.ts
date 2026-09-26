import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

type MonitorSource = "audit" | "events" | "unmapped";
type VerificationFilter = "all" | "valid" | "invalid";
type MonitorRow = Record<string, Json>;

type MonitorInput = {
  source: MonitorSource;
  page?: number;
  pageSize?: number;
  search?: string;
  eventType?: string;
  verificationType?: string;
  verification?: VerificationFilter;
  httpStatus?: string;
  eventStatus?: string;
};

type ServerContext = {
  userId: string;
  supabase: {
    from: (table: string) => any;
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: any }>;
  };
};

export type WebhookMonitorResponse = {
  rows: MonitorRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  refreshedAt: string;
};

async function requireOrganization(context: ServerContext): Promise<string> {
  const { data: membership, error } = await context.supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", context.userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error || !membership?.organization_id) {
    throw new Error(error?.message ?? "No active organization membership");
  }

  const organizationId = String(membership.organization_id);
  const { data: allowed, error: permissionError } = await context.supabase.rpc(
    "azwa_has_org_permission",
    { p_org_id: organizationId, p_permission: "webhooks.read" },
  );

  if (permissionError || !allowed) throw new Error("Forbidden");
  return organizationId;
}

function normalizePage(value: number | undefined, fallback: number) {
  return Math.max(1, Math.trunc(value ?? fallback));
}

function normalizeSearch(value: string | undefined) {
  return (value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_.:+-]/g, "")
    .slice(0, 120);
}

export const readWebhookMonitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: MonitorInput) => input)
  .handler(async ({ data, context }): Promise<WebhookMonitorResponse> => {
    const organizationId = await requireOrganization(context as unknown as ServerContext);
    const { supabaseRuntimeAdmin } = await import("@/integrations/supabase/client.server");
    const runtime = supabaseRuntimeAdmin as any;

    const page = normalizePage(data.page, 1);
    const pageSize = Math.min(200, normalizePage(data.pageSize, 50));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const search = normalizeSearch(data.search);
    const eventType = (data.eventType ?? "").trim();

    let query: any;
    let orderColumn = "received_at";

    if (data.source === "audit") {
      query = runtime
        .from("meta_webhook_request_audit")
        .select(
          "id,organization_id,webhook_endpoint_id,method,received_at,verification_type,verification_valid,http_status,event_type,meta_waba_id,meta_phone_number_id,request_id,created_at",
          { count: "exact" },
        )
        .eq("organization_id", organizationId);

      if (eventType) query = query.eq("event_type", eventType);
      if (data.verificationType) query = query.eq("verification_type", data.verificationType);
      if (data.verification === "valid") query = query.eq("verification_valid", true);
      if (data.verification === "invalid") query = query.eq("verification_valid", false);
      if (data.httpStatus && /^\d{3}$/.test(data.httpStatus)) {
        query = query.eq("http_status", Number(data.httpStatus));
      }
      if (search) {
        query = query.or(
          `meta_phone_number_id.ilike.%${search}%,meta_waba_id.ilike.%${search}%,request_id.ilike.%${search}%`,
        );
      }
    } else if (data.source === "events") {
      query = runtime
        .from("webhook_events")
        .select(
          "id,organization_id,webhook_endpoint_id,received_at,event_type,signature_valid,status,attempts,processed_at,meta_waba_id,meta_phone_number_id,meta_message_id,error,error_message,last_error",
          { count: "exact" },
        )
        .eq("organization_id", organizationId);

      if (eventType) query = query.eq("event_type", eventType);
      if (data.verification === "valid") query = query.eq("signature_valid", true);
      if (data.verification === "invalid") query = query.eq("signature_valid", false);
      if (data.eventStatus) query = query.eq("status", data.eventStatus);
      if (search) {
        query = query.or(
          `meta_phone_number_id.ilike.%${search}%,meta_waba_id.ilike.%${search}%,meta_message_id.ilike.%${search}%`,
        );
      }
    } else {
      orderColumn = "last_seen_at";
      query = runtime
        .from("unmapped_number_events")
        .select(
          "id,organization_id,webhook_event_id,meta_phone_number_id,meta_waba_id,display_phone_number,occurrences,first_seen_at,last_seen_at,resolved",
          { count: "exact" },
        )
        .eq("organization_id", organizationId);

      if (data.eventStatus === "resolved") query = query.eq("resolved", true);
      if (data.eventStatus === "open") query = query.eq("resolved", false);
      if (search) {
        query = query.or(
          `meta_phone_number_id.ilike.%${search}%,meta_waba_id.ilike.%${search}%,display_phone_number.ilike.%${search}%`,
        );
      }
    }

    const {
      data: rows,
      count,
      error,
    } = await query.order(orderColumn, { ascending: false }).range(from, to);

    if (error) throw new Error(error.message);

    const total = count ?? 0;
    return {
      rows: (rows ?? []) as MonitorRow[],
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      refreshedAt: new Date().toISOString(),
    };
  });
