/**
 * Meta production connectivity checks for WhatsApp Business Platform.
 * Server-only: validates the resolved token and guarantees that the AzWA app
 * is subscribed to every WABA discovered under a Business Portfolio.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MetaGraphClient, resolveCredential } from "./graph.server";

export const REQUIRED_WHATSAPP_PERMISSIONS = [
  "whatsapp_business_management",
  "whatsapp_business_messaging",
  "business_management",
] as const;

type PermissionRow = { permission?: string; status?: string };
type DebugTokenData = {
  data?: {
    app_id?: string;
    is_valid?: boolean;
    expires_at?: number;
    data_access_expires_at?: number;
    scopes?: string[];
    type?: string;
    user_id?: string;
  };
};

type SubscriptionRow = {
  whatsapp_business_api_data?: {
    id?: string;
    name?: string;
    link?: string;
  };
};

export type MetaTokenValidation = {
  ok: boolean;
  source: string;
  expectedAppId: string | null;
  appId: string | null;
  isValid: boolean;
  expiresAt: number | null;
  dataAccessExpiresAt: number | null;
  permissions: string[];
  missingPermissions: string[];
  warnings: string[];
  errors: string[];
};

async function expectedAppIdForOrganization(organizationId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("meta_apps")
    .select("meta_app_id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.meta_app_id ?? null;
}

function expired(epochSeconds: number | null | undefined) {
  if (!epochSeconds || epochSeconds === 0) return false;
  return epochSeconds * 1000 <= Date.now();
}

export async function validatePortfolioCredential(input: {
  organizationId: string;
  businessPortfolioId: string;
}): Promise<MetaTokenValidation> {
  const credential = await resolveCredential({ businessPortfolioId: input.businessPortfolioId });
  const expectedAppId = await expectedAppIdForOrganization(input.organizationId);

  if (!credential.token) {
    return {
      ok: false,
      source: credential.source,
      expectedAppId,
      appId: null,
      isValid: false,
      expiresAt: null,
      dataAccessExpiresAt: null,
      permissions: [],
      missingPermissions: [...REQUIRED_WHATSAPP_PERMISSIONS],
      warnings: [],
      errors: ["No Meta access token resolved for this Business Portfolio"],
    };
  }

  const client = new MetaGraphClient(credential.token, {
    organizationId: input.organizationId,
    businessPortfolioId: input.businessPortfolioId,
  });

  const errors: string[] = [];
  const warnings: string[] = [];
  const permissionsResult = await client.request<{ data?: PermissionRow[] }>("me/permissions");
  const permissions = (permissionsResult.data?.data ?? [])
    .filter((row) => String(row.status ?? "").toLowerCase() === "granted")
    .map((row) => row.permission)
    .filter((value): value is string => Boolean(value));

  if (!permissionsResult.ok) {
    errors.push(`Unable to read token permissions: ${permissionsResult.errorMessage ?? "Graph error"}`);
  }

  // /debug_token normally expects an app-capable debugger token. Some valid
  // System User tokens cannot self-debug, so debugger failure is reported as a
  // warning while explicit permission validation remains a hard gate.
  const debugResult = await client.request<DebugTokenData>("debug_token", {
    query: { input_token: credential.token },
  });
  const debug = debugResult.data?.data;
  if (!debugResult.ok) {
    warnings.push(`Token debugger unavailable: ${debugResult.errorMessage ?? "Graph error"}`);
  }

  const appId = debug?.app_id ?? null;
  const isValid = debug?.is_valid ?? permissionsResult.ok;
  const expiresAt = debug?.expires_at ?? null;
  const dataAccessExpiresAt = debug?.data_access_expires_at ?? null;
  const debugScopes = debug?.scopes ?? [];
  const effectivePermissions = [...new Set([...permissions, ...debugScopes])];
  const missingPermissions = REQUIRED_WHATSAPP_PERMISSIONS.filter(
    (permission) => !effectivePermissions.includes(permission),
  );

  if (debug && !isValid) errors.push("Meta reports that the access token is invalid");
  if (expired(expiresAt)) errors.push("Meta access token has expired");
  if (expired(dataAccessExpiresAt)) errors.push("Meta token data access has expired");
  if (expectedAppId && appId && expectedAppId !== appId) {
    errors.push(`Token belongs to Meta App ${appId}, expected ${expectedAppId}`);
  }
  if (expectedAppId && !appId) warnings.push("Token-to-App binding could not be verified by /debug_token");
  if (missingPermissions.length > 0) {
    errors.push(`Missing permissions: ${missingPermissions.join(", ")}`);
  }

  return {
    ok: errors.length === 0,
    source: credential.source,
    expectedAppId,
    appId,
    isValid,
    expiresAt,
    dataAccessExpiresAt,
    permissions: effectivePermissions,
    missingPermissions,
    warnings,
    errors,
  };
}

export async function ensureWabaSubscription(input: {
  organizationId: string;
  businessPortfolioId: string | null;
  wabaId: string;
  metaWabaId: string;
}) {
  const credential = await resolveCredential({
    wabaId: input.wabaId,
    businessPortfolioId: input.businessPortfolioId,
  });
  if (!credential.token) {
    return { ok: false as const, subscribed: false, changed: false, error: "No Meta credential" };
  }

  const expectedAppId = await expectedAppIdForOrganization(input.organizationId);
  if (!expectedAppId) {
    return {
      ok: false as const,
      subscribed: false,
      changed: false,
      error: "No active Meta App configured for this organization",
    };
  }

  const client = new MetaGraphClient(credential.token, {
    organizationId: input.organizationId,
    wabaId: input.wabaId,
    businessPortfolioId: input.businessPortfolioId,
  });

  const inspect = async () => {
    const result = await client.request<{ data?: SubscriptionRow[] }>(
      `${input.metaWabaId}/subscribed_apps`,
    );
    const subscribed = (result.data?.data ?? []).some(
      (row) => row.whatsapp_business_api_data?.id === expectedAppId,
    );
    return { result, subscribed };
  };

  const before = await inspect();
  if (before.result.ok && before.subscribed) {
    return { ok: true as const, subscribed: true, changed: false, appId: expectedAppId };
  }

  const subscribe = await client.request<{ success?: boolean | string }>(
    `${input.metaWabaId}/subscribed_apps`,
    { method: "POST" },
  );
  if (!subscribe.ok) {
    return {
      ok: false as const,
      subscribed: false,
      changed: false,
      error: subscribe.errorMessage ?? "Unable to subscribe app to WABA",
    };
  }

  const after = await inspect();
  if (!after.result.ok || !after.subscribed) {
    return {
      ok: false as const,
      subscribed: false,
      changed: true,
      error: after.result.errorMessage ?? "Subscription POST succeeded but verification failed",
    };
  }

  return { ok: true as const, subscribed: true, changed: true, appId: expectedAppId };
}

export async function recordMetaHealth(input: {
  organizationId: string;
  businessPortfolioId?: string | null;
  wabaId?: string | null;
  component: string;
  ok: boolean;
  message: string;
}) {
  await supabaseAdmin.from("health_checks").insert({
    organization_id: input.organizationId,
    business_portfolio_id: input.businessPortfolioId ?? null,
    waba_id: input.wabaId ?? null,
    component: input.component,
    status: input.ok ? "healthy" : "critical",
    message: input.message,
    score: input.ok ? 100 : 0,
    checked_at: new Date().toISOString(),
  });
}
