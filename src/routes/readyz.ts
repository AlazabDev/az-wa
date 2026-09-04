import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/readyz")({
  server: {
    handlers: {
      GET: async () => {
        const headers = { "cache-control": "no-store" };

        try {
          const { supabaseAdmin, supabaseRuntimeAdmin } =
            await import("@/integrations/supabase/client.server");

          const [
            organizationCheck,
            numbersCheck,
            webhookCheck,
            outboxCheck,
            jobsCheck,
            eventsCheck,
            webhookSecretsCheck,
          ] = await Promise.all([
            supabaseAdmin
              .from("organizations")
              .select("id", { head: true, count: "exact" })
              .limit(1),
            supabaseAdmin
              .from("whatsapp_numbers")
              .select("id", { head: true, count: "exact" })
              .eq("status", "active")
              .eq("is_enabled", true),
            supabaseAdmin
              .from("webhook_endpoints")
              .select("id, url, verification_status")
              .eq("endpoint_type", "meta_whatsapp")
              .eq("status", "active")
              .limit(1)
              .maybeSingle(),
            supabaseRuntimeAdmin
              .from("message_outbox")
              .select("id", { head: true, count: "exact" })
              .limit(1),
            supabaseRuntimeAdmin.from("jobs").select("id", { head: true, count: "exact" }).limit(1),
            supabaseRuntimeAdmin
              .from("webhook_events")
              .select("id", { head: true, count: "exact" })
              .limit(1),
            supabaseAdmin.rpc("backend_list_webhook_secrets"),
          ]);

          const webhookSecrets = Array.isArray(webhookSecretsCheck.data)
            ? webhookSecretsCheck.data
            : [];
          const configuredWebhookSecret = webhookSecrets.some(
            (row) =>
              typeof row.verify_token === "string" &&
              row.verify_token.length > 0 &&
              typeof row.app_secret === "string" &&
              row.app_secret.length > 0,
          );

          const checks = {
            database: !organizationCheck.error,
            runtimeTables: !outboxCheck.error && !jobsCheck.error && !eventsCheck.error,
            activeNumbers: !numbersCheck.error && (numbersCheck.count ?? 0) > 0,
            centralWebhook:
              !webhookCheck.error &&
              Boolean(webhookCheck.data?.id) &&
              webhookCheck.data?.url === "https://wa.alazab.com/webhooks/meta/whatsapp",
            webhookCredentials: !webhookSecretsCheck.error && configuredWebhookSecret,
          };

          const ok = Object.values(checks).every(Boolean);
          if (!ok) {
            console.error("[AzWA readyz] readiness checks failed", {
              checks,
              organizationError: organizationCheck.error?.message ?? null,
              numbersError: numbersCheck.error?.message ?? null,
              webhookError: webhookCheck.error?.message ?? null,
              outboxError: outboxCheck.error?.message ?? null,
              jobsError: jobsCheck.error?.message ?? null,
              eventsError: eventsCheck.error?.message ?? null,
              webhookSecretsError: webhookSecretsCheck.error?.message ?? null,
            });
          }

          return Response.json(
            {
              ok,
              service: "az-wa",
              status: ok ? "ready" : "not_ready",
              checks,
              inventory: {
                activeNumbers: numbersCheck.count ?? 0,
              },
            },
            { status: ok ? 200 : 503, headers },
          );
        } catch (error) {
          console.error("[AzWA readyz] readiness check failed", error);
          return Response.json(
            {
              ok: false,
              service: "az-wa",
              status: "not_ready",
              checks: {
                database: false,
                runtimeTables: false,
                activeNumbers: false,
                centralWebhook: false,
                webhookCredentials: false,
              },
            },
            { status: 503, headers },
          );
        }
      },
    },
  },
});
