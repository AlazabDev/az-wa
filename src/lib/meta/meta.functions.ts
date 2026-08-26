import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const syncBusinessPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { portfolioId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: portfolio, error } = await context.supabase
      .from("business_portfolios")
      .select("id, organization_id")
      .eq("id", data.portfolioId)
      .maybeSingle();

    if (error || !portfolio) throw new Error("Business portfolio not found or not accessible");

    return invokeAzwaApi("/meta/sync", {
      organization_id: portfolio.organization_id,
      business_portfolio_id: portfolio.id,
      sync_type: "full",
    });
  });

export const testWhatsappNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { numberId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: number, error } = await context.supabase
      .from("whatsapp_numbers")
      .select("id, organization_id, waba_id, meta_phone_number_id, display_phone_number")
      .eq("id", data.numberId)
      .maybeSingle();

    if (error || !number) throw new Error("WhatsApp number not found or not accessible");

    try {
      const health = await invokeAzwaApi("/numbers/test", {
        organization_id: number.organization_id,
        whatsapp_number_id: number.id,
      });
      return {
        numberId: number.id,
        results: [
          {
            name: "Meta Connectivity",
            status: health?.status === "healthy" ? ("PASS" as const) : ("WARNING" as const),
            detail: health?.latency_ms != null ? `Meta Graph API reachable (${health.latency_ms}ms)` : "Meta Graph API check completed",
          },
          {
            name: "WABA Mapping",
            status: number.waba_id ? ("PASS" as const) : ("FAIL" as const),
            detail: number.waba_id ? "Number is mapped to a WABA" : "Number has no WABA mapping",
          },
          {
            name: "Phone Number Mapping",
            status: number.meta_phone_number_id ? ("PASS" as const) : ("FAIL" as const),
            detail: number.meta_phone_number_id
              ? `Phone Number ID ${number.meta_phone_number_id}`
              : "Missing Meta Phone Number ID",
          },
        ],
      };
    } catch (error) {
      return {
        numberId: number.id,
        results: [
          {
            name: "Meta Connectivity",
            status: "FAIL" as const,
            detail: error instanceof Error ? error.message : "Meta Graph API check failed",
          },
          {
            name: "WABA Mapping",
            status: number.waba_id ? ("PASS" as const) : ("FAIL" as const),
            detail: number.waba_id ? "Number is mapped to a WABA" : "Number has no WABA mapping",
          },
          {
            name: "Phone Number Mapping",
            status: number.meta_phone_number_id ? ("PASS" as const) : ("FAIL" as const),
            detail: number.meta_phone_number_id
              ? `Phone Number ID ${number.meta_phone_number_id}`
              : "Missing Meta Phone Number ID",
          },
        ],
      };
    }
  });

async function invokeAzwaApi(path: string, body: Record<string, unknown>) {
  const request = getRequest();
  const authorization = request.headers.get("authorization");
  const supabaseUrl = process.env["SUPABASE_URL"]?.replace(/\/$/, "");
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!authorization) throw new Error("Unauthorized: missing bearer token");
  if (!supabaseUrl || !publishableKey) throw new Error("Supabase server configuration is incomplete");

  const response = await fetch(`${supabaseUrl}/functions/v1/azwa-api${path}`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      apikey: publishableKey,
      "Content-Type": "application/json",
      "X-Request-ID": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({ message: response.statusText }));
  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error ?? `AzWA API request failed (${response.status})`);
  }
  return payload;
}
