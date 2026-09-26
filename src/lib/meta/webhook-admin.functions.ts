import { createHash, randomUUID } from "node:crypto";

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WebhookEndpointRow = {
  id: string;
  organization_id: string;
  meta_app_id: string | null;
  meta_app_name: string | null;
  endpoint_type: string;
  url: string;
  status: string;
  verification_status: string | null;
  has_verify_token: boolean;
  verify_token_fingerprint: string | null;
  has_app_secret: boolean;
  app_secret_fingerprint: string | null;
  last_event_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
};

export type WebhookAdminContext = {
  organizationId: string;
  endpoints: WebhookEndpointRow[];
  verifyTokenEnv: string | null;
  appSecretEnv: string | null;
  minio: {
    configured: boolean;
    endpoint: string;
    bucket: string;
    region: string;
    useSSL: boolean;
    endpointReachable: boolean | null;
  };
};

type ServerContext = {
  userId: string;
  supabase: {
    from: (table: string) => any;
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: any }>;
  };
};

type WebhookSecretRow = {
  webhook_endpoint_id: string;
  verify_token: string | null;
  app_secret: string | null;
};

function fingerprint(secret: string | null | undefined): string | null {
  if (!secret) return null;
  return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

function envValue(name: string): string | undefined {
  const value = Reflect.get(process.env, name) as string | undefined;
  return value?.trim() || undefined;
}

async function requireOrganization(context: ServerContext, permission: string): Promise<string> {
  const { data: membership, error } = await context.supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", context.userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error || !membership) throw new Error("No active organization membership");

  const organizationId = String(membership.organization_id);
  const { data: allowed, error: permissionError } = await context.supabase.rpc(
    "azwa_has_org_permission",
    { p_org_id: organizationId, p_permission: permission },
  );
  if (permissionError || !allowed) throw new Error("Forbidden");
  return organizationId;
}

async function storeCredential(input: {
  organizationId: string;
  metaAppId: string;
  type: "verify_token" | "app_secret";
  name: string;
  secret: string;
}): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("backend_store_meta_credential", {
    p_organization_id: input.organizationId,
    p_credential_type: input.type,
    p_name: input.name,
    p_secret: input.secret,
    p_meta_app_id: input.metaAppId,
    p_scopes: [],
  });
  if (error || !data) throw new Error(error?.message ?? `Unable to store ${input.type}`);
  return String(data);
}

async function loadEndpointForOrg(endpointId: string, organizationId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("webhook_endpoints")
    .select(
      "id,organization_id,meta_app_id,endpoint_type,url,status,verification_status,verify_token_credential_id,app_secret_credential_id,last_event_at,last_success_at,last_failure_at",
    )
    .eq("id", endpointId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Webhook endpoint not found");
  return data;
}

export const loadWebhookAdminContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: Record<string, never>) => input)
  .handler(async ({ context }) => {
    const organizationId = await requireOrganization(
      context as unknown as ServerContext,
      "webhooks.read",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const [
      { data: endpoints, error: endpointError },
      { data: apps, error: appError },
      secretsResult,
    ] = await Promise.all([
      db
        .from("webhook_endpoints")
        .select(
          "id,organization_id,meta_app_id,endpoint_type,url,status,verification_status,verify_token_credential_id,app_secret_credential_id,last_event_at,last_success_at,last_failure_at",
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true }),
      db
        .from("meta_apps")
        .select("id,display_name,meta_app_id")
        .eq("organization_id", organizationId),
      supabaseAdmin.rpc("backend_list_webhook_secrets"),
    ]);

    if (endpointError) throw new Error(endpointError.message);
    if (appError) throw new Error(appError.message);
    if (secretsResult.error) throw new Error(secretsResult.error.message);

    const appById = new Map<string, { display_name: string | null; meta_app_id: string }>(
      (apps ?? []).map((app: any) => [String(app.id), app]),
    );
    const secretByEndpoint = new Map<string, WebhookSecretRow>(
      ((secretsResult.data ?? []) as WebhookSecretRow[]).map((row) => [
        row.webhook_endpoint_id,
        row,
      ]),
    );

    const rows: WebhookEndpointRow[] = (endpoints ?? []).map((endpoint: any) => {
      const app = endpoint.meta_app_id ? appById.get(String(endpoint.meta_app_id)) : undefined;
      const secret = secretByEndpoint.get(String(endpoint.id));
      return {
        id: String(endpoint.id),
        organization_id: String(endpoint.organization_id),
        meta_app_id: endpoint.meta_app_id ? String(endpoint.meta_app_id) : null,
        meta_app_name: app?.display_name ?? app?.meta_app_id ?? null,
        endpoint_type: String(endpoint.endpoint_type ?? "meta_whatsapp"),
        url: String(endpoint.url),
        status: String(endpoint.status ?? "inactive"),
        verification_status: endpoint.verification_status
          ? String(endpoint.verification_status)
          : null,
        has_verify_token: Boolean(endpoint.verify_token_credential_id && secret?.verify_token),
        verify_token_fingerprint: fingerprint(secret?.verify_token),
        has_app_secret: Boolean(endpoint.app_secret_credential_id && secret?.app_secret),
        app_secret_fingerprint: fingerprint(secret?.app_secret),
        last_event_at: endpoint.last_event_at ? String(endpoint.last_event_at) : null,
        last_success_at: endpoint.last_success_at ? String(endpoint.last_success_at) : null,
        last_failure_at: endpoint.last_failure_at ? String(endpoint.last_failure_at) : null,
      };
    });

    const minioEndpoint = envValue("MINIO_ENDPOINT") ?? "";
    const accessKey = envValue("MINIO_ACCESS_KEY");
    const secretKey = envValue("MINIO_SECRET_KEY");

    return {
      organizationId,
      endpoints: rows,
      verifyTokenEnv: envValue("META_WEBHOOK_VERIFY_TOKEN") ? "Configured" : null,
      appSecretEnv: envValue("META_APP_SECRET") ? "Configured" : null,
      minio: {
        configured: Boolean(minioEndpoint && accessKey && secretKey),
        endpoint: minioEndpoint,
        bucket: envValue("MINIO_BUCKET_NAME") ?? envValue("MINIO_BUCKET") ?? "az-bk-whatsapp",
        region: envValue("MINIO_REGION") ?? "us-east-1",
        useSSL: minioEndpoint.startsWith("https://") || envValue("MINIO_USE_SSL") === "true",
        endpointReachable: null,
      },
    } satisfies WebhookAdminContext;
  });

export const upsertWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      endpointId: string | null;
      metaAppId: string;
      url: string;
      endpointType: string;
      verifyToken: string | null;
      appSecret: string | null;
      status: "active" | "inactive";
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const organizationId = await requireOrganization(
      context as unknown as ServerContext,
      "webhooks.manage",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data: app, error: appError } = await db
      .from("meta_apps")
      .select("id")
      .eq("id", data.metaAppId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (appError || !app) throw new Error("Meta App not found or not accessible");

    let current: any = null;
    if (data.endpointId) current = await loadEndpointForOrg(data.endpointId, organizationId);

    let verifyCredentialId = current?.verify_token_credential_id ?? null;
    let appSecretCredentialId = current?.app_secret_credential_id ?? null;

    if (data.verifyToken?.trim()) {
      verifyCredentialId = await storeCredential({
        organizationId,
        metaAppId: data.metaAppId,
        type: "verify_token",
        name: "Meta Webhook Verify Token",
        secret: data.verifyToken.trim(),
      });
    }
    if (data.appSecret?.trim()) {
      appSecretCredentialId = await storeCredential({
        organizationId,
        metaAppId: data.metaAppId,
        type: "app_secret",
        name: "Meta App Secret",
        secret: data.appSecret.trim(),
      });
    }
    if (!verifyCredentialId) throw new Error("Verify token is required");
    if (!appSecretCredentialId) throw new Error("App secret is required");

    const values = {
      organization_id: organizationId,
      meta_app_id: data.metaAppId,
      endpoint_type: data.endpointType,
      url: data.url.trim(),
      status: data.status,
      verify_token_credential_id: verifyCredentialId,
      app_secret_credential_id: appSecretCredentialId,
      updated_at: new Date().toISOString(),
    };

    if (current) {
      const { error } = await db.from("webhook_endpoints").update(values).eq("id", current.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("webhook_endpoints").insert(values);
      if (error) throw new Error(error.message);
    }

    return { ok: true as const };
  });

export const setWebhookEndpointStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { endpointId: string; status: "active" | "inactive" }) => input)
  .handler(async ({ data, context }) => {
    const organizationId = await requireOrganization(
      context as unknown as ServerContext,
      "webhooks.manage",
    );
    await loadEndpointForOrg(data.endpointId, organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("webhook_endpoints")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.endpointId)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { endpointId: string }) => input)
  .handler(async ({ data, context }) => {
    const organizationId = await requireOrganization(
      context as unknown as ServerContext,
      "webhooks.manage",
    );
    const endpoint = await loadEndpointForOrg(data.endpointId, organizationId);
    const credentialIds = [
      endpoint.verify_token_credential_id,
      endpoint.app_secret_credential_id,
    ].filter(Boolean);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { error } = await db
      .from("webhook_endpoints")
      .delete()
      .eq("id", data.endpointId)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
    if (credentialIds.length) {
      const { error: credentialError } = await db
        .from("meta_credentials")
        .update({ status: "inactive", updated_at: new Date().toISOString() })
        .in("id", credentialIds);
      if (credentialError) throw new Error(credentialError.message);
    }
    return { ok: true as const };
  });

export const testWebhookChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { endpointId: string }) => input)
  .handler(async ({ data, context }) => {
    const organizationId = await requireOrganization(
      context as unknown as ServerContext,
      "webhooks.manage",
    );
    const endpoint = await loadEndpointForOrg(data.endpointId, organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: secrets, error: secretError } = await supabaseAdmin.rpc(
      "backend_list_webhook_secrets",
    );
    if (secretError) throw new Error(secretError.message);
    const secret = ((secrets ?? []) as WebhookSecretRow[]).find(
      (row) => row.webhook_endpoint_id === data.endpointId,
    );
    if (!secret?.verify_token) throw new Error("Verify token is not configured");

    const challenge = randomUUID().replaceAll("-", "");
    const target = new URL(String(endpoint.url));
    target.searchParams.set("hub.mode", "subscribe");
    target.searchParams.set("hub.verify_token", secret.verify_token);
    target.searchParams.set("hub.challenge", challenge);

    let ok = false;
    let detail = "";
    try {
      const response = await fetch(target, { signal: AbortSignal.timeout(10_000) });
      const body = (await response.text()).trim();
      ok = response.ok && body === challenge;
      detail = ok
        ? `HTTP ${response.status} · challenge matched`
        : `HTTP ${response.status} · challenge ${body === challenge ? "matched" : "mismatch"}`;
    } catch (error) {
      detail = error instanceof Error ? error.message : "Webhook challenge failed";
    }

    const now = new Date().toISOString();
    await (supabaseAdmin as any)
      .from("webhook_endpoints")
      .update({
        verification_status: ok ? "verified" : "failed",
        ...(ok ? { last_success_at: now } : { last_failure_at: now }),
        updated_at: now,
      })
      .eq("id", data.endpointId)
      .eq("organization_id", organizationId);

    return { ok, detail };
  });

export const reconcileMetaWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: Record<string, never>) => input)
  .handler(async ({ context }) => {
    const organizationId = await requireOrganization(
      context as unknown as ServerContext,
      "webhooks.manage",
    );
    const { reconcileMetaAppWebhook } = await import("./app-webhook.server");
    return reconcileMetaAppWebhook(organizationId);
  });

export const testMinioConnectivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: Record<string, never>) => input)
  .handler(async ({ context }) => {
    await requireOrganization(context as unknown as ServerContext, "webhooks.read");
    const endpoint = envValue("MINIO_ENDPOINT");
    if (!endpoint) return { ok: false as const, detail: "MINIO_ENDPOINT is not configured" };

    try {
      const response = await fetch(endpoint, {
        method: "HEAD",
        signal: AbortSignal.timeout(7_000),
      });
      const reachable = response.status > 0 && response.status < 500;
      return {
        ok: reachable,
        detail: `HTTP ${response.status}${reachable ? " · endpoint reachable" : ""}`,
      };
    } catch (error) {
      return {
        ok: false as const,
        detail: error instanceof Error ? error.message : "Connection failed",
      };
    }
  });
