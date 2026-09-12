import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/notify/$id")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const integrationId = params.id;

          // Basic secret verification via query param or header
          const url = new URL(request.url);
          const secret = url.searchParams.get("secret") || request.headers.get("x-notify-secret");

          const { data: integration, error } = await (supabaseAdmin.from as any)(
            "notification_integrations",
          )
            .select(
              "id, organization_id, webhook_secret, sender_number_id, recipient_numbers, status",
            )
            .eq("id", integrationId)
            .eq("status", "active")
            .maybeSingle();

          if (error || !integration) {
            return new Response("Integration not found or inactive", { status: 404 });
          }

          if (integration.webhook_secret !== secret) {
            return new Response("Unauthorized", { status: 401 });
          }

          // Parse notification payload
          let payloadText = "";
          try {
            const body = await request.json();
            // simple text serialization for now
            payloadText =
              typeof body.message === "string" ? body.message : JSON.stringify(body, null, 2);
          } catch {
            payloadText = await request.text();
          }

          if (!payloadText.trim()) {
            return new Response("Empty payload", { status: 400 });
          }

          // We need to send a message. Since Meta requires templates for business-initiated messages
          // outside of the 24h window, sending arbitrary text might fail if there's no open window.
          // For a true notification system, you'd usually use a pre-approved utility template.
          // But as a starting point, we will attempt to send it if we had a generic template or
          // just try sending a text message (which works if the window is open).
          // For reliability in notifications, let's assume we have a "notification_alert" template,
          // or we just send it as text and let it fail if the window is closed.

          // In a real scenario, you'd use a template:
          // await sendTemplateMessage(...)

          // For now, let's just log and attempt a text message for each recipient.
          // If we must use a template, we'd need its name. We'll use a generic approach.

          let successCount = 0;
          for (const recipient of integration.recipient_numbers) {
            // Note: Sending free-form text outside 24h window will fail with Meta API.
            // Ideally, we'd map this to a WhatsApp template.
            const { error: sendError } = await supabaseAdmin.functions.invoke(
              "send-whatsapp-message",
              {
                body: {
                  organization_id: integration.organization_id,
                  phone_number_id: integration.sender_number_id,
                  to: recipient,
                  type: "text",
                  text: { body: `[تنبيه النظام]\n${payloadText}` },
                },
              },
            );

            if (!sendError) {
              successCount++;
            }
          }

          return new Response(JSON.stringify({ success: true, delivered: successCount }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          console.error("Notify API Error:", e);
          return new Response("Internal Server Error", { status: 500 });
        }
      },
    },
  },
});
