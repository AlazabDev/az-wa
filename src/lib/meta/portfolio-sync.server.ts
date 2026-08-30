/**
 * Complete Business Portfolio -> WABA -> phone reconciliation.
 * Every Meta collection is cursor-paginated; no account is silently omitted.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ensureWabaSubscription,
  recordMetaHealth,
  validatePortfolioCredential,
} from "./connectivity.server";
import { MetaGraphClient, resolveCredential } from "./graph.server";
import { syncWabaTemplates } from "./templates.server";

export type CompleteSyncReport = {
  portfolio: string;
  wabas: { discovered: number; inserted: number; updated: number; missing: number };
  numbers: { discovered: number; inserted: number; updated: number; missing: number };
  templates: { synced: number; failed: number };
  subscriptions: { verified: number; repaired: number; failed: number };
  warnings: string[];
  errors: string[];
};

type GraphPage<T> = {
  data?: T[];
  paging?: {
    cursors?: { after?: string };
    next?: string;
  };
};

type WabaNode = {
  id: string;
  name?: string;
  currency?: string;
  timezone_id?: string;
};

type PhoneNode = {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
  platform_type?: string;
  status?: string;
  messaging_limit_tier?: string;
  code_verification_status?: string;
};

async function fetchAllPages<T>(
  client: MetaGraphClient,
  path: string,
  query: Record<string, string> = {},
): Promise<{ items: T[]; error?: string }> {
  const items: T[] = [];
  const seenCursors = new Set<string>();
  let after: string | undefined;

  for (let page = 0; page < 100; page += 1) {
    const pageQuery: Record<string, string> = { ...query, limit: query["limit"] ?? "100" };
    if (after) pageQuery["after"] = after;

    const response = await client.request<GraphPage<T>>(path, { query: pageQuery });
    if (!response.ok) {
      return { items, error: response.errorMessage ?? `Graph request failed for ${path}` };
    }

    items.push(...(response.data?.data ?? []));
    const nextCursor = response.data?.paging?.next
      ? response.data.paging.cursors?.after
      : undefined;
    if (!nextCursor || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    after = nextCursor;
  }

  return { items };
}

function normalizePhoneStatus(status?: string | null) {
  const value = (status ?? "CONNECTED").toUpperCase();
  if (value === "CONNECTED" || value === "ACTIVE") return "active";
  if (value === "DISCONNECTED" || value === "OFFLINE") return "disconnected";
  if (value === "RESTRICTED" || value === "BLOCKED") return "restricted";
  if (value === "DELETED" || value === "MISSING") return "missing_from_meta";
  if (value === "INACTIVE") return "inactive";
  return "requires_review";
}

export async function syncPortfolioComplete(portfolioId: string): Promise<CompleteSyncReport> {
  const report: CompleteSyncReport = {
    portfolio: portfolioId,
    wabas: { discovered: 0, inserted: 0, updated: 0, missing: 0 },
    numbers: { discovered: 0, inserted: 0, updated: 0, missing: 0 },
    templates: { synced: 0, failed: 0 },
    subscriptions: { verified: 0, repaired: 0, failed: 0 },
    warnings: [],
    errors: [],
  };

  const { data: portfolio } = await supabaseAdmin
    .from("business_portfolios")
    .select("id, organization_id, meta_business_id")
    .eq("id", portfolioId)
    .maybeSingle();
  if (!portfolio) {
    report.errors.push("Business portfolio not found");
    return report;
  }

  const validation = await validatePortfolioCredential({
    organizationId: portfolio.organization_id,
    businessPortfolioId: portfolio.id,
  });
  report.warnings.push(...validation.warnings);
  await recordMetaHealth({
    organizationId: portfolio.organization_id,
    businessPortfolioId: portfolio.id,
    component: "Meta System User Token",
    ok: validation.ok,
    message: validation.ok
      ? `Credential valid via ${validation.source}; permissions: ${validation.permissions.join(", ")}`
      : validation.errors.join("; "),
  });
  if (!validation.ok) {
    report.errors.push(...validation.errors);
    return report;
  }

  const credential = await resolveCredential({ businessPortfolioId: portfolio.id });
  if (!credential.token) {
    report.errors.push("No usable Meta credential resolved for this Business Portfolio");
    return report;
  }

  const client = new MetaGraphClient(credential.token, {
    organizationId: portfolio.organization_id,
    businessPortfolioId: portfolio.id,
  });

  const [clientWabas, ownedWabas] = await Promise.all([
    fetchAllPages<WabaNode>(client, `${portfolio.meta_business_id}/client_whatsapp_business_accounts`),
    fetchAllPages<WabaNode>(client, `${portfolio.meta_business_id}/owned_whatsapp_business_accounts`),
  ]);

  if (clientWabas.error && ownedWabas.error) {
    report.errors.push(clientWabas.error, ownedWabas.error);
    return report;
  }
  if (clientWabas.error) report.warnings.push(`Client WABA discovery: ${clientWabas.error}`);
  if (ownedWabas.error) report.warnings.push(`Owned WABA discovery: ${ownedWabas.error}`);

  const discoveredMap = new Map<string, WabaNode>();
  for (const waba of [...clientWabas.items, ...ownedWabas.items]) discoveredMap.set(waba.id, waba);
  const discovered = [...discoveredMap.values()];
  report.wabas.discovered = discovered.length;
  const seenWabaMetaIds = new Set(discoveredMap.keys());

  for (const waba of discovered) {
    const { data: existing } = await supabaseAdmin
      .from("wabas")
      .select("id")
      .eq("business_portfolio_id", portfolio.id)
      .eq("meta_waba_id", waba.id)
      .maybeSingle();

    const now = new Date().toISOString();
    let wabaRowId: string;
    if (existing) {
      const { error } = await supabaseAdmin
        .from("wabas")
        .update({
          name: waba.name ?? null,
          currency: waba.currency ?? null,
          timezone: waba.timezone_id ?? null,
          status: "active",
          last_synced_at: now,
        })
        .eq("id", existing.id);
      if (error) {
        report.errors.push(`WABA ${waba.id}: ${error.message}`);
        continue;
      }
      wabaRowId = existing.id;
      report.wabas.updated += 1;
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("wabas")
        .insert({
          organization_id: portfolio.organization_id,
          business_portfolio_id: portfolio.id,
          meta_waba_id: waba.id,
          name: waba.name ?? `WABA ${waba.id}`,
          currency: waba.currency ?? null,
          timezone: waba.timezone_id ?? null,
          status: "active",
          last_synced_at: now,
        })
        .select("id")
        .single();
      if (error || !inserted) {
        report.errors.push(`WABA ${waba.id}: ${error?.message ?? "insert failed"}`);
        continue;
      }
      wabaRowId = inserted.id;
      report.wabas.inserted += 1;
    }

    const subscription = await ensureWabaSubscription({
      organizationId: portfolio.organization_id,
      businessPortfolioId: portfolio.id,
      wabaId: wabaRowId,
      metaWabaId: waba.id,
    });
    if (subscription.ok) {
      report.subscriptions.verified += 1;
      if (subscription.changed) report.subscriptions.repaired += 1;
    } else {
      report.subscriptions.failed += 1;
      report.errors.push(`WABA ${waba.id} webhook subscription: ${subscription.error}`);
    }
    await recordMetaHealth({
      organizationId: portfolio.organization_id,
      businessPortfolioId: portfolio.id,
      wabaId: wabaRowId,
      component: "Meta Webhook Subscription",
      ok: subscription.ok,
      message: subscription.ok
        ? subscription.changed
          ? "AzWA app subscription created and verified"
          : "AzWA app subscription verified"
        : subscription.error,
    });

    const phonesResult = await fetchAllPages<PhoneNode>(client, `${waba.id}/phone_numbers`);
    if (phonesResult.error) {
      report.errors.push(`Phone discovery for WABA ${waba.id}: ${phonesResult.error}`);
    } else {
      report.numbers.discovered += phonesResult.items.length;
      const seenPhoneIds = new Set<string>();
      for (const phone of phonesResult.items) {
        seenPhoneIds.add(phone.id);
        const { data: existingNumber } = await supabaseAdmin
          .from("whatsapp_numbers")
          .select("id")
          .eq("meta_phone_number_id", phone.id)
          .maybeSingle();

        const patch = {
          display_phone_number: phone.display_phone_number,
          verified_name: phone.verified_name ?? null,
          quality_rating: phone.quality_rating ?? null,
          messaging_limit: phone.messaging_limit_tier ?? null,
          platform_type: phone.platform_type ?? null,
          code_verification_status: phone.code_verification_status ?? null,
          status: normalizePhoneStatus(phone.status),
          last_synced_at: now,
          waba_id: wabaRowId,
        };

        if (existingNumber) {
          const { error } = await supabaseAdmin
            .from("whatsapp_numbers")
            .update(patch)
            .eq("id", existingNumber.id);
          if (error) report.errors.push(`Number ${phone.id}: ${error.message}`);
          else report.numbers.updated += 1;
        } else {
          const { error } = await supabaseAdmin.from("whatsapp_numbers").insert({
            ...patch,
            organization_id: portfolio.organization_id,
            meta_phone_number_id: phone.id,
          });
          if (error) report.errors.push(`Number ${phone.id}: ${error.message}`);
          else report.numbers.inserted += 1;
        }
      }

      const { data: localNumbers } = await supabaseAdmin
        .from("whatsapp_numbers")
        .select("id, meta_phone_number_id")
        .eq("waba_id", wabaRowId);
      for (const local of localNumbers ?? []) {
        if (!seenPhoneIds.has(local.meta_phone_number_id)) {
          const { error } = await supabaseAdmin
            .from("whatsapp_numbers")
            .update({ status: "missing_from_meta" })
            .eq("id", local.id);
          if (error) report.errors.push(`Number ${local.meta_phone_number_id}: ${error.message}`);
          else report.numbers.missing += 1;
        }
      }
    }

    const templateResult = await syncWabaTemplates(wabaRowId);
    if (templateResult.ok) report.templates.synced += templateResult.synced;
    else {
      report.templates.failed += 1;
      report.errors.push(`Template sync for WABA ${waba.id}: ${templateResult.error}`);
    }
  }

  const { data: localWabas } = await supabaseAdmin
    .from("wabas")
    .select("id, meta_waba_id")
    .eq("business_portfolio_id", portfolio.id);
  for (const local of localWabas ?? []) {
    if (!seenWabaMetaIds.has(local.meta_waba_id)) {
      const { error } = await supabaseAdmin
        .from("wabas")
        .update({ status: "missing_from_meta" })
        .eq("id", local.id);
      if (error) report.errors.push(`WABA ${local.meta_waba_id}: ${error.message}`);
      else report.wabas.missing += 1;
    }
  }

  await supabaseAdmin
    .from("business_portfolios")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", portfolio.id);

  return report;
}
