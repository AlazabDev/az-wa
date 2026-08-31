/* eslint-disable @typescript-eslint/no-explicit-any */
/** Meta App webhook subscription inspection/reconciliation — server only. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MetaGraphClient } from "./graph.server";

export const WHATSAPP_WEBHOOK_FIELDS = [
  "messages",
  "flows",
  "message_template_status_update",
  "message_template_quality_update",
  "message_template_components_update",
  "template_category_update",
  "template_correct_category_detection",
  "phone_number_name_update",
  "phone_number_quality_update",
  "account_update",
  "account_review_update",
  "account_alerts",
  "business_capability_update",
  "security",
  "calls",
  "group_lifecycle_update",
  "group_settings_update",
  "history",
  "partner_solutions",
] as const;

type AppSubscription = {
  object?: string;
  callback_url?: string;
  active?: boolean;
  fields?: Array<{ name?: string; version?: string }>;
};

async function loadAppRuntime(organizationId: string) {
  const db = supabaseAdmin as any;
  const { data: app, error: appError } = await db
    .from("meta_apps")
    .select("id,meta_app_id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (appError || !app) throw new Error("No active Meta App configured");

  const { data: endpoint, error: endpointError } = await db
    .from("webhook_endpoints")
    .select("id,url")
    .eq("organization_id", organizationId)
    .eq("meta_app_id", app.id)
    .eq("endpoint_type", "meta_whatsapp")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (endpointError || !endpoint) throw new Error("No active Meta WhatsApp webhook endpoint configured");

  const { data: credential, error: credentialError } = await db
    .from("meta_credentials")
    .select("id,secret_reference")
    .eq("organization_id", organizationId)
    .eq("meta_app_id", app.id)
    .eq("credential_type", "access_token")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (credentialError || !credential) throw new Error("Meta App Access Token is not configured");

  const { data: appAccessToken, error: decryptError } = await supabaseAdmin.rpc(
    "backend_decrypt_secret_reference",
    { p_secret_reference: credential.secret_reference },
  );
  if (decryptError || !appAccessToken) throw new Error("Unable to decrypt Meta App Access Token");

  const { data: webhookSecrets, error: secretError } = await supabaseAdmin.rpc(
    "backend_list_webhook_secrets",
  );
  if (secretError) throw new Error(secretError.message);
  const secretRow = (webhookSecrets ?? []).find((row) => row.meta_app_id === app.id);
  if (!secretRow?.verify_token) throw new Error("Meta Webhook Verify Token is not configured");

  return {
    appInternalId: String(app.id),
    metaAppId: String(app.meta_app_id),
    callbackUrl: String(endpoint.url),
    verifyToken: String(secretRow.verify_token),
    token: String(appAccessToken),
  };
}

function summarize(subscriptions: AppSubscription[], callbackUrl: string) {
  const whatsapp = subscriptions.find((item) => item.object === "whatsapp_business_account") ?? null;
  const fields = new Set((whatsapp?.fields ?? []).map((field) => field.name).filter(Boolean) as string[]);
  const missingFields = WHATSAPP_WEBHOOK_FIELDS.filter((field) => !fields.has(field));
  return {
    configured: Boolean(whatsapp),
    active: Boolean(whatsapp?.active),
    callbackUrl: whatsapp?.callback_url ?? null,
    callbackMatches: whatsapp?.callback_url === callbackUrl,
    fields: [...fields].sort(),
    missingFields,
    healthy:
      Boolean(whatsapp?.active) && whatsapp?.callback_url === callbackUrl && missingFields.length === 0,
  };
}

export async function inspectMetaAppWebhook(organizationId: string) {
  const runtime = await loadAppRuntime(organizationId);
  const client = new MetaGraphClient(runtime.token, { organizationId });
  const response = await client.request<{ data?: AppSubscription[] }>(`${runtime.metaAppId}/subscriptions`);
  if (!response.ok) {
    return { ok: false as const, error: response.errorMessage ?? "Unable to inspect Meta App subscriptions" };
  }
  return {
    ok: true as const,
    appId: runtime.metaAppId,
    desiredCallbackUrl: runtime.callbackUrl,
    ...summarize(response.data?.data ?? [], runtime.callbackUrl),
  };
}

export async function reconcileMetaAppWebhook(organizationId: string) {
  const runtime = await loadAppRuntime(organizationId);
  const client = new MetaGraphClient(runtime.token, { organizationId });

  const before = await client.request<{ data?: AppSubscription[] }>(`${runtime.metaAppId}/subscriptions`);
  if (!before.ok) {
    return { ok: false as const, changed: false, error: before.errorMessage ?? "Unable to inspect subscriptions" };
  }
  const state = summarize(before.data?.data ?? [], runtime.callbackUrl);
  if (state.healthy) return { ok: true as const, changed: false, ...state };

  const write = await client.request<{ success?: boolean }>(`${runtime.metaAppId}/subscriptions`, {
    method: "POST",
    query: {
      object: "whatsapp_business_account",
      callback_url: runtime.callbackUrl,
      verify_token: runtime.verifyToken,
      fields: WHATSAPP_WEBHOOK_FIELDS.join(","),
      include_values: "true",
    },
  });
  if (!write.ok) {
    return { ok: false as const, changed: false, error: write.errorMessage ?? "Unable to configure App webhook" };
  }

  const after = await client.request<{ data?: AppSubscription[] }>(`${runtime.metaAppId}/subscriptions`);
  if (!after.ok) {
    return { ok: false as const, changed: true, error: after.errorMessage ?? "Configured but verification failed" };
  }
  const verified = summarize(after.data?.data ?? [], runtime.callbackUrl);
  return verified.healthy
    ? { ok: true as const, changed: true, ...verified }
    : { ok: false as const, changed: true, error: `Webhook still incomplete: ${verified.missingFields.join(", ")}`, ...verified };
}
