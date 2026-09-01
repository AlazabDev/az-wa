/**
 * Live production status sync against Meta — server only.
 * Combines: token validation, App-level webhook subscription inspection and
 * per-WABA subscribed_apps reconciliation, then records health_checks rows.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ensureWabaSubscription, recordMetaHealth, validatePortfolioCredential } from "./connectivity.server";
import { inspectMetaAppWebhook } from "./app-webhook.server";

export type LiveWabaStatus = {
  wabaId: string;
  metaWabaId: string;
  name: string | null;
  subscribed: boolean;
  changed: boolean;
  error?: string;
};

export type LiveStatusReport = {
  ok: boolean;
  checkedAt: string;
  token: Awaited<ReturnType<typeof validatePortfolioCredential>> | null;
  webhook: Awaited<ReturnType<typeof inspectMetaAppWebhook>> | null;
  wabas: LiveWabaStatus[];
  errors: string[];
};

export async function syncLiveMetaStatus(organizationId: string): Promise<LiveStatusReport> {
  const errors: string[] = [];

  const { data: portfolio } = await supabaseAdmin
    .from("business_portfolios")
    .select("id")
    .eq("organization_id", organizationId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let token: LiveStatusReport["token"] = null;
  if (portfolio?.id) {
    token = await validatePortfolioCredential({
      organizationId,
      businessPortfolioId: portfolio.id,
    });
    if (!token.ok) errors.push(...token.errors);
    await recordMetaHealth({
      organizationId,
      businessPortfolioId: portfolio.id,
      component: "meta_token",
      ok: token.ok,
      message: token.ok ? "System user token valid" : token.errors.join("; ").slice(0, 500),
    });
  } else {
    errors.push("No Business Portfolio found for this organization");
  }

  let webhook: LiveStatusReport["webhook"] = null;
  try {
    webhook = await inspectMetaAppWebhook(organizationId);
    if (!webhook.ok) errors.push(webhook.error ?? "App webhook inspection failed");
    await recordMetaHealth({
      organizationId,
      businessPortfolioId: portfolio?.id ?? null,
      component: "meta_app_webhook",
      ok: Boolean(webhook.ok && webhook.healthy),
      message: webhook.ok
        ? webhook.healthy
          ? "App subscribed to WhatsApp webhook fields"
          : `Needs reconcile: ${(webhook.missingFields ?? []).join(", ") || "callback mismatch"}`
        : (webhook.error ?? "inspection failed"),
    });
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "App webhook inspection failed");
  }

  const { data: wabaRows } = await supabaseAdmin
    .from("wabas")
    .select("id, meta_waba_id, name, business_portfolio_id")
    .eq("organization_id", organizationId);

  const wabas: LiveWabaStatus[] = [];
  for (const waba of wabaRows ?? []) {
    if (!waba.meta_waba_id) continue;
    const result = await ensureWabaSubscription({
      organizationId,
      businessPortfolioId: waba.business_portfolio_id ?? portfolio?.id ?? null,
      wabaId: waba.id,
      metaWabaId: waba.meta_waba_id,
    });
    wabas.push({
      wabaId: waba.id,
      metaWabaId: waba.meta_waba_id,
      name: waba.name ?? null,
      subscribed: result.subscribed,
      changed: result.changed,
      ...("error" in result && result.error ? { error: result.error } : {}),
    });
    if (!result.ok) errors.push(`${waba.name ?? waba.meta_waba_id}: ${result.error ?? "not subscribed"}`);
    await recordMetaHealth({
      organizationId,
      businessPortfolioId: waba.business_portfolio_id ?? null,
      wabaId: waba.id,
      component: "waba_subscription",
      ok: result.ok,
      message: result.ok
        ? result.changed
          ? "App subscription restored"
          : "App subscribed"
        : (result.error ?? "not subscribed"),
    });
  }

  return {
    ok: errors.length === 0,
    checkedAt: new Date().toISOString(),
    token,
    webhook,
    wabas,
    errors,
  };
}
