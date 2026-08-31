/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { inspectMetaAppWebhook } from "./app-webhook.server";
import { validatePortfolioCredential } from "./connectivity.server";
import { GRAPH_VERSION } from "./graph.server";
import { META_INVENTORY_BASELINE } from "./inventory-baseline";
import type { MetaProductionReadiness, ReadinessCheck } from "./production-readiness.types";

export async function buildMetaProductionReadiness(
  organizationId: string,
): Promise<MetaProductionReadiness> {
  const db = supabaseAdmin as any;
  const [
    apps,
    portfolios,
    credentials,
    endpoints,
    wabas,
    numbers,
    templates,
    flows,
    subscriptions,
  ] = await Promise.all([
    db.from("meta_apps").select("id,meta_app_id,status").eq("organization_id", organizationId),
    db
      .from("business_portfolios")
      .select("id,meta_business_id,status")
      .eq("organization_id", organizationId),
    db
      .from("meta_credentials")
      .select("credential_type,status")
      .eq("organization_id", organizationId),
    db
      .from("webhook_endpoints")
      .select("url,status,verification_status")
      .eq("organization_id", organizationId)
      .eq("endpoint_type", "meta_whatsapp"),
    db
      .from("wabas")
      .select("id,meta_waba_id,status,last_synced_at")
      .eq("organization_id", organizationId),
    db
      .from("whatsapp_numbers")
      .select(
        "id,waba_id,meta_phone_number_id,display_phone_number,status,is_enabled,last_synced_at",
      )
      .eq("organization_id", organizationId),
    db
      .from("templates")
      .select("id,waba_id,status,last_synced_at")
      .eq("organization_id", organizationId),
    db
      .from("whatsapp_flows")
      .select("id,waba_id,status,last_synced_at")
      .eq("organization_id", organizationId),
    db
      .from("waba_subscribed_apps")
      .select("id,waba_id,meta_app_id,is_azwa,status,last_synced_at")
      .eq("organization_id", organizationId),
  ]);

  const errors = [
    apps,
    portfolios,
    credentials,
    endpoints,
    wabas,
    numbers,
    templates,
    flows,
    subscriptions,
  ]
    .map((result) => result.error?.message)
    .filter(Boolean) as string[];
  if (errors.length) throw new Error(`Production readiness query failed: ${errors.join("; ")}`);

  const appRows = apps.data ?? [];
  const portfolioRows = portfolios.data ?? [];
  const credentialRows = credentials.data ?? [];
  const endpointRows = endpoints.data ?? [];
  const wabaRows = wabas.data ?? [];
  const numberRows = numbers.data ?? [];
  const templateRows = templates.data ?? [];
  const flowRows = flows.data ?? [];
  const subscriptionRows = subscriptions.data ?? [];

  const activeApp = appRows.find((row: any) => row.status === "active");
  const primaryPortfolio =
    portfolioRows.find(
      (row: any) => row.meta_business_id === META_INVENTORY_BASELINE.businessMetaId,
    ) ?? portfolioRows[0];
  const activeCredentialTypes = new Set<string>(
    credentialRows
      .filter((row: any) => row.status === "active")
      .map((row: any) => String(row.credential_type)),
  );
  const requiredCredentialTypes = [
    "verify_token",
    "app_secret",
    "access_token",
    "system_user_token",
  ];
  const missingCredentialTypes = requiredCredentialTypes.filter(
    (type) => !activeCredentialTypes.has(type),
  );
  const activeWebhook = endpointRows.find((row: any) => row.status === "active");
  const activeWabas = wabaRows.filter((row: any) => row.status === "active");
  const nonMissingNumbers = numberRows.filter((row: any) => row.status !== "missing_from_meta");
  const unsafeSenders = numberRows.filter(
    (row: any) => row.status !== "active" && row.is_enabled === true,
  );
  const approvedTemplates = templateRows.filter(
    (row: any) => String(row.status).toUpperCase() === "APPROVED",
  );
  const liveFlows = flowRows.filter(
    (row: any) => !["MISSING_FROM_META", "DELETED"].includes(String(row.status).toUpperCase()),
  );
  const publishedFlows = liveFlows.filter(
    (row: any) => String(row.status).toUpperCase() === "PUBLISHED",
  );
  const draftFlows = liveFlows.filter((row: any) => String(row.status).toUpperCase() === "DRAFT");
  const externalActiveSubscriptions = subscriptionRows.filter(
    (row: any) => !row.is_azwa && row.status === "active",
  );
  const azwaSubscribedWabas = new Set<string>(
    subscriptionRows
      .filter((row: any) => row.is_azwa && row.status === "active")
      .map((row: any) => String(row.waba_id)),
  );
  const missingAzwaSubscriptions = activeWabas.filter(
    (row: any) => !azwaSubscribedWabas.has(String(row.id)),
  );
  const staleWabas = wabaRows.filter((row: any) => row.status === "missing_from_meta");
  const staleNumbers = numberRows.filter((row: any) => row.status === "missing_from_meta");

  const baselinePhoneIds = new Set<string>(
    META_INVENTORY_BASELINE.phones.map((phone) => phone.metaPhoneId),
  );
  const discoveredPhoneIds = new Set<string>(
    numberRows.map((row: any) => String(row.meta_phone_number_id)),
  );
  const numberByMetaId = new Map<string, any>(
    numberRows.map((row: any) => [String(row.meta_phone_number_id), row]),
  );
  const missingBaselinePhones: string[] = [...baselinePhoneIds].filter(
    (id) => !discoveredPhoneIds.has(id),
  );
  const extraPhones: string[] = [...discoveredPhoneIds].filter((id) => !baselinePhoneIds.has(id));
  const expectedActiveButUnavailable = META_INVENTORY_BASELINE.phones.filter((phone) => {
    if (phone.expectedStatus !== "active") return false;
    const live = numberByMetaId.get(phone.metaPhoneId);
    return live && String(live.status).toLowerCase() !== "active";
  });

  let liveCredentialOk = false;
  let liveCredentialDetail = "Business Portfolio is not configured";
  if (primaryPortfolio?.id) {
    try {
      const validation = await validatePortfolioCredential({
        organizationId,
        businessPortfolioId: String(primaryPortfolio.id),
      });
      liveCredentialOk = validation.ok;
      liveCredentialDetail = validation.ok
        ? `Live token valid via ${validation.source}; ${validation.permissions.length} granted permissions`
        : validation.errors.join("; ") || "Meta token validation failed";
      if (validation.warnings.length) {
        liveCredentialDetail += `; warnings: ${validation.warnings.join("; ")}`;
      }
    } catch (cause) {
      liveCredentialDetail =
        cause instanceof Error ? cause.message : "Live token validation failed";
    }
  }

  let liveWebhookOk = false;
  let liveWebhookDetail = "Meta App webhook is not configured";
  try {
    const webhook = await inspectMetaAppWebhook(organizationId);
    if (webhook.ok) {
      liveWebhookOk = webhook.healthy;
      liveWebhookDetail = webhook.healthy
        ? `Active callback ${webhook.callbackUrl}; ${webhook.fields.length} subscribed fields`
        : `Live subscription incomplete; callback match=${webhook.callbackMatches}; missing fields=${webhook.missingFields.join(", ") || "none"}`;
    } else {
      liveWebhookDetail = webhook.error;
    }
  } catch (cause) {
    liveWebhookDetail = cause instanceof Error ? cause.message : "Live webhook inspection failed";
  }

  const checks: ReadinessCheck[] = [
    {
      key: "graph-version",
      label: "Meta Graph API",
      ok: GRAPH_VERSION === META_INVENTORY_BASELINE.graphVersion,
      severity: "critical",
      detail: `Runtime ${GRAPH_VERSION}; audited baseline ${META_INVENTORY_BASELINE.graphVersion}`,
    },
    {
      key: "meta-app",
      label: "AzWA Meta App",
      ok: String(activeApp?.meta_app_id ?? "") === META_INVENTORY_BASELINE.azwaAppId,
      severity: "critical",
      detail: activeApp
        ? `Active App ID ${activeApp.meta_app_id}`
        : "No active Meta App configured",
    },
    {
      key: "business-portfolio",
      label: "Business Portfolio",
      ok:
        String(primaryPortfolio?.meta_business_id ?? "") === META_INVENTORY_BASELINE.businessMetaId,
      severity: "critical",
      detail: primaryPortfolio
        ? `Business ID ${primaryPortfolio.meta_business_id}`
        : "No Business Portfolio configured",
    },
    {
      key: "credentials",
      label: "Vault credentials",
      ok: missingCredentialTypes.length === 0,
      severity: "critical",
      detail: missingCredentialTypes.length
        ? `Missing: ${missingCredentialTypes.join(", ")}`
        : "Verify Token, App Secret, App Access Token and System User Token are active",
    },
    {
      key: "system-token-live",
      label: "Live System User Token",
      ok: liveCredentialOk,
      severity: "critical",
      detail: liveCredentialDetail,
    },
    {
      key: "webhook",
      label: "Webhook database configuration",
      ok: Boolean(activeWebhook?.url),
      severity: "critical",
      detail: activeWebhook
        ? `${activeWebhook.url} (${activeWebhook.verification_status ?? "verification unknown"})`
        : "No active WhatsApp webhook endpoint",
    },
    {
      key: "app-webhook-live",
      label: "Live Meta App webhook subscription",
      ok: liveWebhookOk,
      severity: "critical",
      detail: liveWebhookDetail,
    },
    {
      key: "wabas",
      label: "WABA discovery",
      ok: activeWabas.length >= META_INVENTORY_BASELINE.counts.wabas,
      severity: "critical",
      detail: `${activeWabas.length} active; audited baseline ${META_INVENTORY_BASELINE.counts.wabas}; stale ${staleWabas.length}`,
    },
    {
      key: "numbers",
      label: "Phone number discovery",
      ok:
        nonMissingNumbers.length >= META_INVENTORY_BASELINE.counts.phoneNumbers &&
        missingBaselinePhones.length === 0,
      severity: "critical",
      detail: `${nonMissingNumbers.length} discovered; missing baseline ${missingBaselinePhones.length}; new since audit ${extraPhones.length}`,
    },
    {
      key: "expected-active-numbers",
      label: "Audited active sender state",
      ok: expectedActiveButUnavailable.length === 0,
      severity: "critical",
      detail: expectedActiveButUnavailable.length
        ? `Expected active but unavailable: ${expectedActiveButUnavailable.map((phone) => phone.number).join(", ")}`
        : "All seven phone numbers audited as active are still operational",
    },
    {
      key: "sender-safety",
      label: "Sender safety",
      ok: unsafeSenders.length === 0,
      severity: "critical",
      detail: unsafeSenders.length
        ? `${unsafeSenders.length} non-active numbers are still enabled`
        : "No disconnected/restricted/missing number is enabled for sending",
    },
    {
      key: "templates",
      label: "Approved template inventory",
      ok: approvedTemplates.length >= META_INVENTORY_BASELINE.counts.approvedTemplates,
      severity: "warning",
      detail: `${approvedTemplates.length} approved templates; audited snapshot ${META_INVENTORY_BASELINE.counts.approvedTemplates}; total local rows ${templateRows.length}`,
    },
    {
      key: "flows",
      label: "WhatsApp Flow inventory",
      ok:
        liveFlows.length >= META_INVENTORY_BASELINE.counts.flows &&
        publishedFlows.length >= META_INVENTORY_BASELINE.counts.publishedFlows &&
        draftFlows.length >= META_INVENTORY_BASELINE.counts.draftFlows,
      severity: "warning",
      detail: `${liveFlows.length} live flows (${publishedFlows.length} published, ${draftFlows.length} draft); audited ${META_INVENTORY_BASELINE.counts.flows} (${META_INVENTORY_BASELINE.counts.publishedFlows} published, ${META_INVENTORY_BASELINE.counts.draftFlows} draft)`,
    },
    {
      key: "external-subscriptions",
      label: "External subscribed-app inventory",
      ok: externalActiveSubscriptions.length >= META_INVENTORY_BASELINE.counts.subscribedApps,
      severity: "warning",
      detail: `${externalActiveSubscriptions.length} external active app subscriptions; audited snapshot ${META_INVENTORY_BASELINE.counts.subscribedApps}`,
    },
    {
      key: "subscriptions",
      label: "AzWA WABA subscriptions",
      ok: missingAzwaSubscriptions.length === 0 && activeWabas.length > 0,
      severity: "critical",
      detail: missingAzwaSubscriptions.length
        ? `${missingAzwaSubscriptions.length} active WABAs are not subscribed to AzWA`
        : `AzWA subscription present on all ${activeWabas.length} active WABAs`,
    },
  ];

  const criticalFailures = checks.filter((check) => !check.ok && check.severity === "critical");
  const warningFailures = checks.filter((check) => !check.ok && check.severity === "warning");
  const passed = checks.filter((check) => check.ok).length;

  return {
    ready: criticalFailures.length === 0,
    score: Math.round((passed / checks.length) * 100),
    auditedAt: META_INVENTORY_BASELINE.generatedAt,
    checks,
    drift: {
      staleWabas: staleWabas.map((row: any) => String(row.meta_waba_id)),
      staleNumbers: staleNumbers.map((row: any) => String(row.meta_phone_number_id)),
      missingBaselinePhones,
      extraPhones,
    },
    totals: {
      wabas: activeWabas.length,
      numbers: nonMissingNumbers.length,
      templates: approvedTemplates.length,
      flows: liveFlows.length,
      subscribedApps: subscriptionRows.filter((row: any) => row.status === "active").length,
    },
    criticalFailures: criticalFailures.length,
    warnings: warningFailures.length,
  };
}
