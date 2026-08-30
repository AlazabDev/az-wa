/**
 * Meta control-plane operations: discovery/sync and connectivity diagnostics.
 * Server-only. Postgres stays the source of operational history — sync never
 * deletes local rows, it only inserts, updates or marks missing.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { MetaGraphClient, clientForNumber, loadNumberScope, resolveCredential } from "./graph.server";

export type SyncReport = {
  portfolio: string;
  wabas: { discovered: number; inserted: number; updated: number; missing: number };
  numbers: { discovered: number; inserted: number; updated: number; missing: number };
  errors: string[];
};

function normalizePhoneStatus(status?: string | null) {
  const value = (status ?? "CONNECTED").toUpperCase();
  if (value === "CONNECTED" || value === "ACTIVE") return "active";
  if (value === "DISCONNECTED" || value === "OFFLINE") return "disconnected";
  if (value === "RESTRICTED" || value === "BLOCKED") return "restricted";
  if (value === "DELETED" || value === "MISSING") return "missing_from_meta";
  if (value === "INACTIVE") return "inactive";
  return "requires_review";
}

export async function syncPortfolio(portfolioId: string): Promise<SyncReport> {
  const report: SyncReport = {
    portfolio: portfolioId,
    wabas: { discovered: 0, inserted: 0, updated: 0, missing: 0 },
    numbers: { discovered: 0, inserted: 0, updated: 0, missing: 0 },
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

  const cred = await resolveCredential({ businessPortfolioId: portfolio.id });
  if (!cred.token) {
    report.errors.push(
      "No usable Meta credential resolved for this portfolio. Add a credential before syncing.",
    );
    return report;
  }
  const client = new MetaGraphClient(cred.token, {
    organizationId: portfolio.organization_id,
    businessPortfolioId: portfolio.id,
  });

  type WabaNode = { id: string; name?: string; currency?: string; timezone_id?: string };
  const wabaRes = await client.request<{ data: WabaNode[] }>(
    `${portfolio.meta_business_id}/client_whatsapp_business_accounts`,
    { query: { limit: "200" } },
  );
  const owned = await client.request<{ data: WabaNode[] }>(
    `${portfolio.meta_business_id}/owned_whatsapp_business_accounts`,
    { query: { limit: "200" } },
  );

  if (!wabaRes.ok && !owned.ok) {
    report.errors.push(wabaRes.errorMessage ?? owned.errorMessage ?? "WABA discovery failed");
    return report;
  }

  const discovered = [...(wabaRes.data?.data ?? []), ...(owned.data?.data ?? [])];
  const seenWabaMetaIds = new Set<string>();
  report.wabas.discovered = new Set(discovered.map((item) => item.id)).size;

  for (const w of discovered) {
    if (seenWabaMetaIds.has(w.id)) continue;
    seenWabaMetaIds.add(w.id);
    const { data: existing } = await supabaseAdmin
      .from("wabas")
      .select("id")
      .eq("business_portfolio_id", portfolio.id)
      .eq("meta_waba_id", w.id)
      .maybeSingle();

    let wabaRowId: string;
    if (existing) {
      const { error } = await supabaseAdmin
        .from("wabas")
        .update({
          name: w.name ?? null,
          currency: w.currency ?? null,
          timezone: w.timezone_id ?? null,
          status: "active",
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) {
        report.errors.push(`WABA ${w.id}: ${error.message}`);
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
          meta_waba_id: w.id,
          name: w.name ?? `WABA ${w.id}`,
          currency: w.currency ?? null,
          timezone: w.timezone_id ?? null,
          status: "active",
          last_synced_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error || !inserted) {
        report.errors.push(`WABA ${w.id}: ${error?.message ?? "insert failed"}`);
        continue;
      }
      wabaRowId = inserted.id;
      report.wabas.inserted += 1;
    }

    const numbersRes = await client.request<{
      data: Array<{
        id: string;
        display_phone_number: string;
        verified_name?: string;
        quality_rating?: string;
        platform_type?: string;
        status?: string;
        messaging_limit_tier?: string;
        code_verification_status?: string;
      }>;
    }>(`${w.id}/phone_numbers`, { query: { limit: "200" } });

    if (!numbersRes.ok) {
      report.errors.push(`Phone discovery for WABA ${w.id}: ${numbersRes.errorMessage}`);
      continue;
    }
    const phones = numbersRes.data?.data ?? [];
    report.numbers.discovered += phones.length;
    const seenPhoneIds: string[] = [];

    for (const p of phones) {
      seenPhoneIds.push(p.id);
      const { data: existingNumber } = await supabaseAdmin
        .from("whatsapp_numbers")
        .select("id")
        .eq("meta_phone_number_id", p.id)
        .maybeSingle();
      const patch = {
        display_phone_number: p.display_phone_number,
        verified_name: p.verified_name ?? null,
        quality_rating: p.quality_rating ?? null,
        messaging_limit: p.messaging_limit_tier ?? null,
        platform_type: p.platform_type ?? null,
        code_verification_status: p.code_verification_status ?? null,
        status: normalizePhoneStatus(p.status),
        last_synced_at: new Date().toISOString(),
      };
      if (existingNumber) {
        const { error } = await supabaseAdmin
          .from("whatsapp_numbers")
          .update({ ...patch, waba_id: wabaRowId })
          .eq("id", existingNumber.id);
        if (error) report.errors.push(`Number ${p.id}: ${error.message}`);
        else report.numbers.updated += 1;
      } else {
        const { error } = await supabaseAdmin.from("whatsapp_numbers").insert({
          ...patch,
          organization_id: portfolio.organization_id,
          waba_id: wabaRowId,
          meta_phone_number_id: p.id,
        });
        if (error) report.errors.push(`Number ${p.id}: ${error.message}`);
        else report.numbers.inserted += 1;
      }
    }

    const { data: localNumbers } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("id, meta_phone_number_id")
      .eq("waba_id", wabaRowId);
    for (const local of localNumbers ?? []) {
      if (!seenPhoneIds.includes(local.meta_phone_number_id)) {
        const { error } = await supabaseAdmin
          .from("whatsapp_numbers")
          .update({ status: "missing_from_meta" })
          .eq("id", local.id);
        if (error) report.errors.push(`Number ${local.meta_phone_number_id}: ${error.message}`);
        else report.numbers.missing += 1;
      }
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

export type TestResult = { name: string; status: "PASS" | "WARNING" | "FAIL"; detail: string };

export async function runNumberDiagnostics(numberId: string): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const scope = await loadNumberScope(numberId);
  if (!scope) return [{ name: "Number Mapping", status: "FAIL", detail: "Number not found" }];

  const { data: row } = await supabaseAdmin
    .from("whatsapp_numbers")
    .select("is_enabled, last_incoming_message_at, wabas(meta_waba_id)")
    .eq("id", numberId)
    .maybeSingle();

  const metaWabaId = row?.wabas?.meta_waba_id ?? null;
  const enabled = row?.is_enabled ?? false;

  results.push({
    name: "WABA Mapping",
    status: scope.waba_id ? "PASS" : "FAIL",
    detail: metaWabaId ? `Mapped to WABA ${metaWabaId}` : "No WABA mapping",
  });
  results.push({
    name: "Phone Number Mapping",
    status: "PASS",
    detail: `Phone Number ID ${scope.meta_phone_number_id}`,
  });

  const { client, source } = await clientForNumber(numberId);
  if (!client) {
    results.push({
      name: "Credential",
      status: "FAIL",
      detail: "No active credential resolved for this number",
    });
    results.push({ name: "Meta Connectivity", status: "FAIL", detail: "Skipped — no credential" });
    results.push({ name: "Send Capability", status: "FAIL", detail: "Skipped — no credential" });
    results.push({ name: "Media Capability", status: "FAIL", detail: "Skipped — no credential" });
  } else {
    results.push({ name: "Credential", status: "PASS", detail: `Resolved at ${source} level` });

    const probe = await client.request<{
      id: string;
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      throughput?: { level?: string };
    }>(scope.meta_phone_number_id, {
      query: { fields: "id,display_phone_number,verified_name,quality_rating,throughput" },
    });

    if (probe.ok && probe.data) {
      results.push({
        name: "Meta Connectivity",
        status: "PASS",
        detail: `${probe.data.verified_name ?? probe.data.display_phone_number ?? "OK"} (${probe.durationMs}ms)`,
      });
      results.push({
        name: "Send Capability",
        status: enabled ? "PASS" : "WARNING",
        detail: enabled ? "Number enabled and reachable via Graph API" : "Number disabled in AzWA",
      });
      await supabaseAdmin
        .from("whatsapp_numbers")
        .update({
          last_api_success_at: new Date().toISOString(),
          verified_name: probe.data.verified_name ?? null,
          quality_rating: probe.data.quality_rating ?? null,
          throughput_level: probe.data.throughput?.level ?? null,
        })
        .eq("id", numberId);
    } else {
      results.push({
        name: "Meta Connectivity",
        status: "FAIL",
        detail: `${probe.errorCode ?? "error"}: ${probe.errorMessage ?? "unknown"}`,
      });
      results.push({ name: "Send Capability", status: "FAIL", detail: "Graph API unreachable" });
      await supabaseAdmin
        .from("whatsapp_numbers")
        .update({ last_api_failure_at: new Date().toISOString() })
        .eq("id", numberId);
    }

    const media = await client.request<{ url?: string }>(`${scope.meta_phone_number_id}/media`, {
      query: { limit: "1" },
    });
    results.push({
      name: "Media Capability",
      status: media.status === 400 || media.ok ? "PASS" : "WARNING",
      detail: media.ok ? "Media endpoint reachable" : (media.errorMessage ?? "Endpoint reachable"),
    });
  }

  const { count: webhookCount } = await supabaseAdmin
    .from("webhook_events")
    .select("id", { count: "exact", head: true })
    .eq("whatsapp_number_id", numberId);
  results.push({
    name: "Webhook",
    status: (webhookCount ?? 0) > 0 ? "PASS" : "WARNING",
    detail:
      (webhookCount ?? 0) > 0
        ? `${webhookCount} webhook events received`
        : "No webhook events received yet for this number",
  });
  const lastIncoming = row?.last_incoming_message_at ?? null;
  results.push({
    name: "Receive Capability",
    status: lastIncoming ? "PASS" : "WARNING",
    detail: lastIncoming
      ? `Last inbound ${new Date(lastIncoming).toISOString()}`
      : "No inbound message recorded yet",
  });

  const checkedAt = new Date().toISOString();
  await supabaseAdmin.from("health_checks").insert(
    results.map((r) => ({
      organization_id: scope.organization_id,
      whatsapp_number_id: numberId,
      waba_id: scope.waba_id,
      business_portfolio_id: scope.business_portfolio_id,
      component: r.name,
      status: r.status === "PASS" ? "healthy" : r.status === "WARNING" ? "warning" : "critical",
      message: r.detail,
      score: r.status === "PASS" ? 100 : r.status === "WARNING" ? 50 : 0,
      checked_at: checkedAt,
    })),
  );

  await supabaseAdmin
    .from("whatsapp_numbers")
    .update({ webhook_status: (webhookCount ?? 0) > 0 ? "active" : "pending" })
    .eq("id", numberId);

  return results;
}
