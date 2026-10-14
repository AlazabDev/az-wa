import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Exchange the one-time Embedded Signup code on the server.
 * Never return the customer access token to the browser.
 * A verified account is not marked connected until credential storage exists.
 */
export const completeEmbeddedSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { code: string; wabaId: string; phoneNumberId: string }) => {
    if (!input || !/^[\w-]{5,4096}$/.test(input.code ?? "")) {
      throw new Error("Invalid signup authorization code");
    }
    if (!/^\d{5,25}$/.test(input.wabaId ?? "") || !/^\d{5,25}$/.test(input.phoneNumberId ?? "")) {
      throw new Error("Invalid WhatsApp identifiers");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: memberships, error: memberError } = await context.supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .limit(1);
    if (memberError || !memberships?.[0]) throw new Error("Organization membership required");
    const orgId = memberships[0].organization_id;
    const { data: allowed } = await context.supabase.rpc("azwa_has_org_permission", {
      p_org_id: orgId, p_permission: "wabas.manage",
    });
    if (!allowed) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: app } = await supabaseAdmin.from("meta_apps")
      .select("meta_app_id").eq("organization_id", orgId).eq("status", "active")
      .limit(1).maybeSingle();
    const appId = app?.meta_app_id;
    const appSecret = process.env["META_APP_SECRET"];
    if (!appId || !appSecret) throw new Error("Meta app or META_APP_SECRET is not configured");

    const { GRAPH_BASE } = await import("./graph.server");
    const endpoint = new URL(`${GRAPH_BASE}/oauth/access_token`);
    endpoint.searchParams.set("client_id", appId);
    endpoint.searchParams.set("client_secret", appSecret);
    endpoint.searchParams.set("code", data.code);

    const exchange = await fetch(endpoint.toString(), { method: "GET", cache: "no-store" });
    const tokenData = await exchange.json() as { access_token?: string; error?: { message?: string } };
    if (!exchange.ok || !tokenData.access_token) {
      throw new Error(tokenData.error?.message ?? "Meta authorization code exchange failed");
    }
    const token = tokenData.access_token;

    // Confirm that the issued token can actually access the selected WABA and phone.
    const { MetaGraphClient } = await import("./graph.server");
    const graph = new MetaGraphClient(token, { organizationId: orgId });
    const waba = await graph.request<{ id: string }>(data.wabaId, {
      query: { fields: "id" },
    });
    const phone = await graph.request<{ data?: Array<{ id: string }> }>(
      `${data.wabaId}/phone_numbers`, { query: { fields: "id", limit: "100" } },
    );
    if (!waba.ok || waba.data?.id !== data.wabaId ||
        !phone.ok || !phone.data?.data?.some((item) => item.id === data.phoneNumberId)) {
      throw new Error("The signup code does not authorize the selected WABA and phone");
    }

    // Deliberately do not persist the ephemeral token in plaintext or claim onboarding.
    // Existing credential provisioning must be wired into the application's Vault first.
    return {
      verified: true,
      connected: false,
      wabaId: data.wabaId,
      phoneNumberId: data.phoneNumberId,
      detail: "Meta identity verified. Credential Vault provisioning remains required before activation.",
    };
  });
