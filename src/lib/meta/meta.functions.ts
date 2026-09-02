import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { META_WEBHOOK_CALLBACK_URL } from "./public-config";

export type MetaAppConfigInput = {
  appId: string;
  displayName?: string;
  namespace?: string;
  verifyToken?: string;
  appSecret?: string;
  appAccessToken?: string;
  systemUserToken?: string;
};

export const syncBusinessPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { portfolioId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: portfolio, error: portfolioError } = await context.supabase
      .from("business_portfolios")
      .select("id, organization_id")
      .eq("id", data.portfolioId)
      .maybeSingle();

    if (portfolioError || !portfolio) throw new Error("Portfolio not found or not accessible");

    const { data: allowed, error: permissionError } = await context.supabase.rpc(
      "azwa_has_org_permission",
      { p_org_id: portfolio.organization_id, p_permission: "wabas.manage" },
    );
    if (permissionError || !allowed) throw new Error("Forbidden");

    const { syncPortfolioComplete } = await import("./portfolio-sync.server");
    return syncPortfolioComplete(data.portfolioId);
  });

export const testWhatsappNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { numberId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: number, error: numberError } = await context.supabase
      .from("whatsapp_numbers")
      .select("id, organization_id")
      .eq("id", data.numberId)
      .maybeSingle();
    if (numberError || !number) throw new Error("WhatsApp number not found or not accessible");

    const { data: allowed, error: permissionError } = await context.supabase.rpc(
      "azwa_has_org_permission",
      { p_org_id: number.organization_id, p_permission: "health.read" },
    );
    if (permissionError || !allowed) throw new Error("Forbidden");

    const { runNumberDiagnostics } = await import("./operations.server");
    return { numberId: data.numberId, results: await runNumberDiagnostics(data.numberId) };
  });

export const getMetaAppConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: Record<string, never>) => input)
  .handler(async ({ context }) => {
    const { data: membership, error: membershipError } = await context.supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) throw new Error("No active organization membership");

    const organizationId = membership.organization_id;
    const { data: allowed, error: permissionError } = await context.supabase.rpc(
      "azwa_has_org_permission",
      { p_org_id: organizationId, p_permission: "credentials.manage" },
    );
    if (permissionError || !allowed) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: app } = await supabaseAdmin
      .from("meta_apps")
      .select("id, meta_app_id, display_name, namespace, business_portfolio_id, status")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data: endpoint } = await supabaseAdmin
      .from("webhook_endpoints")
      .select(
        "id, url, status, verification_status, verify_token_credential_id, app_secret_credential_id",
      )
      .eq("organization_id", organizationId)
      .eq("endpoint_type", "meta_whatsapp")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const credentialState = async (credentialType: "system_user_token" | "access_token") => {
      if (!app) return null;
      const { data } = await supabaseAdmin
        .from("meta_credentials")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("meta_app_id", app.id)
        .eq("credential_type", credentialType)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    };

    const [systemToken, appAccessToken] = await Promise.all([
      credentialState("system_user_token"),
      credentialState("access_token"),
    ]);

    return {
      organizationId,
      appId: app?.meta_app_id ?? "",
      displayName: app?.display_name ?? "AzWA",
      namespace: app?.namespace ?? "",
      status: app?.status ?? "unconfigured",
      webhookUrl:
        endpoint?.url ??
        process.env["META_WEBHOOK_PUBLIC_URL"] ??
        META_WEBHOOK_CALLBACK_URL,
      webhookStatus: endpoint?.status ?? "unconfigured",
      verificationStatus: endpoint?.verification_status ?? null,
      hasVerifyToken: Boolean(endpoint?.verify_token_credential_id),
      hasAppSecret: Boolean(endpoint?.app_secret_credential_id),
      hasAppAccessToken: Boolean(appAccessToken?.id),
      hasSystemUserToken: Boolean(systemToken?.id),
    };
  });

export const saveMetaAppConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: MetaAppConfigInput) => input)
  .handler(async ({ data, context }) => {
    const appId = data.appId.trim();
    if (!appId) throw new Error("Meta App ID is required");

    const { data: membership, error: membershipError } = await context.supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) throw new Error("No active organization membership");

    const organizationId = membership.organization_id;
    const { data: allowed, error: permissionError } = await context.supabase.rpc(
      "azwa_has_org_permission",
      { p_org_id: organizationId, p_permission: "credentials.manage" },
    );
    if (permissionError || !allowed) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existingApp, error: existingAppError } = await supabaseAdmin
      .from("meta_apps")
      .select("id, business_portfolio_id")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existingAppError) throw new Error(existingAppError.message);

    const { data: primaryPortfolio } = await supabaseAdmin
      .from("business_portfolios")
      .select("id")
      .eq("organization_id", organizationId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const businessPortfolioId = existingApp?.business_portfolio_id ?? primaryPortfolio?.id ?? null;
    let metaAppInternalId: string;

    if (existingApp) {
      const { data: updated, error } = await supabaseAdmin
        .from("meta_apps")
        .update({
          meta_app_id: appId,
          display_name: data.displayName?.trim() || "AzWA",
          namespace: data.namespace?.trim() || null,
          business_portfolio_id: businessPortfolioId,
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingApp.id)
        .select("id")
        .single();
      if (error || !updated) throw new Error(error?.message ?? "Unable to update Meta App");
      metaAppInternalId = updated.id;
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("meta_apps")
        .insert({
          organization_id: organizationId,
          business_portfolio_id: businessPortfolioId,
          meta_app_id: appId,
          display_name: data.displayName?.trim() || "AzWA",
          namespace: data.namespace?.trim() || null,
          status: "active",
        })
        .select("id")
        .single();
      if (error || !inserted) throw new Error(error?.message ?? "Unable to create Meta App");
      metaAppInternalId = inserted.id;
    }

    const { data: existingEndpoint, error: endpointLookupError } = await supabaseAdmin
      .from("webhook_endpoints")
      .select("id, verify_token_credential_id, app_secret_credential_id")
      .eq("organization_id", organizationId)
      .eq("endpoint_type", "meta_whatsapp")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (endpointLookupError) throw new Error(endpointLookupError.message);

    const existingCredential = async (credentialType: "system_user_token" | "access_token") => {
      const { data: credential } = await supabaseAdmin
        .from("meta_credentials")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("meta_app_id", metaAppInternalId)
        .eq("credential_type", credentialType)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return credential?.id ?? null;
    };

    const storeCredential = async (
      credentialType: "verify_token" | "app_secret" | "system_user_token" | "access_token",
      name: string,
      secret: string,
      portfolioId: string | null,
    ) => {
      const { data: credentialId, error } = await supabaseAdmin.rpc(
        "backend_store_meta_credential",
        {
          p_organization_id: organizationId,
          p_credential_type: credentialType,
          p_name: name,
          p_secret: secret,
          p_meta_app_id: metaAppInternalId,
          ...(portfolioId ? { p_business_portfolio_id: portfolioId } : {}),
          p_scopes: [],
        },
      );
      if (error || !credentialId)
        throw new Error(error?.message ?? `Unable to store ${credentialType}`);
      return credentialId;
    };

    let verifyCredentialId = existingEndpoint?.verify_token_credential_id ?? null;
    let appSecretCredentialId = existingEndpoint?.app_secret_credential_id ?? null;
    let systemTokenCredentialId = await existingCredential("system_user_token");
    let appAccessTokenCredentialId = await existingCredential("access_token");

    if (data.verifyToken?.trim()) {
      verifyCredentialId = await storeCredential(
        "verify_token",
        "Meta Webhook Verify Token",
        data.verifyToken.trim(),
        null,
      );
    }
    if (data.appSecret?.trim()) {
      appSecretCredentialId = await storeCredential(
        "app_secret",
        "Meta App Secret",
        data.appSecret.trim(),
        null,
      );
    }
    if (data.appAccessToken?.trim()) {
      appAccessTokenCredentialId = await storeCredential(
        "access_token",
        "Meta App Access Token",
        data.appAccessToken.trim(),
        null,
      );
    }
    if (data.systemUserToken?.trim()) {
      systemTokenCredentialId = await storeCredential(
        "system_user_token",
        "Meta System User Token",
        data.systemUserToken.trim(),
        businessPortfolioId,
      );
    }

    if (!verifyCredentialId) throw new Error("Verify Token is required for initial setup");
    if (!appSecretCredentialId) throw new Error("App Secret is required for initial setup");
    if (!appAccessTokenCredentialId)
      throw new Error("App Access Token is required for initial setup");
    if (!systemTokenCredentialId)
      throw new Error("System User Token is required for initial setup");

    const webhookUrl =
      process.env["META_WEBHOOK_PUBLIC_URL"] ?? META_WEBHOOK_CALLBACK_URL;
    if (existingEndpoint) {
      const { error } = await supabaseAdmin
        .from("webhook_endpoints")
        .update({
          meta_app_id: metaAppInternalId,
          url: webhookUrl,
          verify_token_credential_id: verifyCredentialId,
          app_secret_credential_id: appSecretCredentialId,
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingEndpoint.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("webhook_endpoints").insert({
        organization_id: organizationId,
        meta_app_id: metaAppInternalId,
        endpoint_type: "meta_whatsapp",
        url: webhookUrl,
        verify_token_credential_id: verifyCredentialId,
        app_secret_credential_id: appSecretCredentialId,
        status: "active",
      });
      if (error) throw new Error(error.message);
    }

    const deactivatePrevious = async (credentialType: string, keepId: string | null) => {
      if (!keepId) return;
      const { error } = await supabaseAdmin
        .from("meta_credentials")
        .update({ status: "inactive", updated_at: new Date().toISOString() })
        .eq("organization_id", organizationId)
        .eq("meta_app_id", metaAppInternalId)
        .eq("credential_type", credentialType)
        .eq("status", "active")
        .neq("id", keepId);
      if (error) throw new Error(error.message);
    };

    await deactivatePrevious("verify_token", verifyCredentialId);
    await deactivatePrevious("app_secret", appSecretCredentialId);
    await deactivatePrevious("access_token", appAccessTokenCredentialId);
    await deactivatePrevious("system_user_token", systemTokenCredentialId);

    return {
      ok: true,
      appId,
      webhookUrl,
      hasVerifyToken: true,
      hasAppSecret: true,
      hasAppAccessToken: true,
      hasSystemUserToken: true,
    };
  });
