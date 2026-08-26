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
      immediate: true,
    });
  });

export const testWhatsappNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { numberId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: number, error } = await context.supabase
      .from("whatsapp_numbers")
      .select("id, organization_id")
      .eq("id", data.numberId)
      .maybeSingle();

    if (error || !number) throw new Error("WhatsApp number not found or not accessible");

    return invokeAzwaApi("/numbers/test", {
      organization_id: number.organization_id,
      whatsapp_number_id: number.id,
    });
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
