import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

type RecordRow = Record<string, Json>;

type ReadInput = {
  table: string;
  orderBy?: string;
  limit?: number;
};

type TableRule = {
  permission: string;
  safeColumns?: string;
};

const TABLE_RULES: Record<string, TableRule> = {
  organizations: { permission: "business.read" },
  business_portfolios: { permission: "business.read" },
  meta_apps: { permission: "business.read" },
  meta_system_users: { permission: "business.read" },
  wabas: { permission: "wabas.read" },
  meta_app_wabas: { permission: "wabas.read" },
  whatsapp_numbers: { permission: "numbers.read" },
  webhook_endpoints: { permission: "webhooks.read" },
  waba_subscribed_apps: { permission: "webhooks.read" },
  waba_assigned_users: { permission: "wabas.read" },
  templates: { permission: "templates.read" },
  whatsapp_flows: { permission: "flows.read" },
  contacts: { permission: "contacts.read" },
  contact_channels: { permission: "contacts.read" },
  conversations: { permission: "messages.read" },
  messages: { permission: "messages.read" },
  message_status_history: { permission: "messages.read" },
  media: { permission: "media.read" },
  campaigns: { permission: "campaigns.read" },
  campaign_recipients: { permission: "campaigns.read" },
  automation_rules: { permission: "automation.read" },
  automation_runs: { permission: "automation.read" },
  webhook_events: { permission: "webhooks.read" },
  unmapped_number_events: { permission: "webhooks.read" },
  api_requests: { permission: "health.read" },
  api_errors: { permission: "health.read" },
  alerts: { permission: "health.read" },
  health_checks: { permission: "health.read" },
  jobs: { permission: "jobs.manage" },
  dead_letter_jobs: { permission: "jobs.manage" },
  meta_sync_runs: { permission: "health.read" },
  message_outbox: { permission: "messages.read" },
  message_send_attempts: { permission: "messages.read" },
  webhook_event_attempts: { permission: "webhooks.read" },
  media_download_attempts: { permission: "media.read" },
  audit_logs: { permission: "audit.read" },
  system_settings: { permission: "settings.manage" },
  roles: { permission: "users.manage" },
  permissions: { permission: "users.manage" },
  role_permissions: { permission: "users.manage" },
  user_roles: { permission: "users.manage" },
  teams: { permission: "users.manage" },
  team_members: { permission: "users.manage" },
  user_business_access: { permission: "users.manage" },
  user_waba_access: { permission: "users.manage" },
  user_number_access: { permission: "users.manage" },
  team_number_access: { permission: "users.manage" },
  organization_members: { permission: "users.manage" },
  profiles: { permission: "users.manage" },
  meta_credentials: {
    permission: "credentials.manage",
    safeColumns:
      "id, organization_id, business_portfolio_id, waba_id, whatsapp_number_id, credential_type, name, token_fingerprint, scopes, expires_at, status, last_verified_at, last_used_at, created_at, updated_at",
  },
};

function safeIdentifier(value: string | undefined, fallback: string) {
  const candidate = value?.trim() || fallback;
  if (!/^[a-z_][a-z0-9_]*$/i.test(candidate)) throw new Error("Invalid order column");
  return candidate;
}

function normalizeCredentialRows(rows: RecordRow[]): RecordRow[] {
  return rows.map((row) => {
    const scope = row["whatsapp_number_id"]
      ? "phone"
      : row["waba_id"]
        ? "waba"
        : row["business_portfolio_id"]
          ? "business"
          : "global";
    return {
      ...row,
      label: row["name"] ?? null,
      scope,
      token_type: row["credential_type"] ?? null,
      last_validated_at: row["last_verified_at"] ?? null,
    };
  });
}

export const readRecordTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: ReadInput) => input)
  .handler(async ({ data, context }): Promise<RecordRow[]> => {
    const rule = TABLE_RULES[data.table];
    if (!rule) throw new Error("Table is not exposed through the AzWA read contract");

    const { supabaseAdmin, supabaseRuntimeAdmin } =
      await import("@/integrations/supabase/client.server");

    const { data: organization, error: organizationError } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("slug", "alazab-group")
      .maybeSingle();
    if (organizationError || !organization?.id) {
      throw new Error(organizationError?.message ?? "Alazab Group organization is not configured");
    }

    const { data: allowed, error: permissionError } = await context.supabase.rpc(
      "azwa_has_org_permission",
      { p_org_id: organization.id, p_permission: rule.permission },
    );
    if (permissionError || !allowed) throw new Error("Forbidden");

    const limit = Math.min(500, Math.max(1, Math.trunc(data.limit ?? 100)));
    const orderBy = safeIdentifier(data.orderBy, "created_at");

    // Runtime client intentionally accepts the allowlisted table names above.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runtime = supabaseRuntimeAdmin as any;
    const globalCatalog = ["roles", "permissions", "role_permissions"].includes(data.table);

    let query = runtime.from(data.table).select(rule.safeColumns ?? "*");
    if (!globalCatalog) query = query.eq("organization_id", organization.id);
    query = query.order(orderBy, { ascending: false }).limit(limit);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const normalized = (rows ?? []) as unknown as RecordRow[];
    return data.table === "meta_credentials" ? normalizeCredentialRows(normalized) : normalized;
  });
