import { createFileRoute } from "@tanstack/react-router";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";

import { META_WEBHOOK_CALLBACK_URL, META_WEBHOOK_INTERNAL_PATH } from "@/lib/meta/public-config";

export const Route = createFileRoute("/_authenticated/webhooks")({
  head: () => ({
    meta: [
      { title: "Webhooks — AzWA" },
      {
        name: "description",
        content:
          "Central webhook gateway: verification endpoint, signature validation, raw event log, deduplication and unmapped-number alerts.",
      },
      { property: "og:title", content: "Webhooks — AzWA" },
      { property: "og:description", content: "One webhook endpoint for every WABA and number." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WebhooksPage,
});

function WebhooksPage() {
  return (
    <>
      <PageHeader
        title="Webhook Gateway"
        description="A single endpoint receives events for every WABA and number. Events are stored raw, signature-verified, deduplicated, then processed asynchronously."
      />

      <Panel title="Endpoint configuration">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Callback URL
            </dt>
            <dd className="mt-1 font-mono text-xs break-all">
              {META_WEBHOOK_CALLBACK_URL}
              <span className="mt-1 block font-sans text-[11px] text-muted-foreground">
                Proxied internally to {META_WEBHOOK_INTERNAL_PATH}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Verify token
            </dt>
            <dd className="mt-1 text-xs text-muted-foreground">
              Stored server-side in the Meta credential vault.
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Signature
            </dt>
            <dd className="mt-1 text-xs text-muted-foreground">
              X-Hub-Signature-256 is validated with the Meta App Secret on every request.
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Required subscriptions
            </dt>
            <dd className="mt-1 text-xs text-muted-foreground">
              messages, message_template_status_update, message_template_quality_update,
              template_category_update, phone_number_quality_update, account_update, message_echoes
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">
              WABA subscription model
            </dt>
            <dd className="mt-1 text-xs text-muted-foreground">
              Portfolio sync verifies /subscribed_apps for every WABA and automatically subscribes
              the AzWA Meta App when it is missing. One WABA subscription covers every number under
              it.
            </dd>
          </div>
        </dl>
      </Panel>

      <div className="mt-6 space-y-6">
        <RecordTable
          title="Recent webhook events"
          table="webhook_events"
          orderBy="received_at"
          columns={[
            { key: "received_at", label: "Received", kind: "date" },
            { key: "event_type", label: "Type" },
            { key: "field", label: "Field" },
            { key: "meta_phone_number_id", label: "Phone Number ID", kind: "mono" },
            { key: "meta_waba_id", label: "WABA ID", kind: "mono" },
            { key: "signature_valid", label: "Signature", kind: "bool" },
            { key: "status", label: "Status", kind: "status" },
            { key: "error_message", label: "Error" },
          ]}
        />

        <RecordTable
          title="Unmapped number events"
          table="unmapped_number_events"
          orderBy="received_at"
          emptyLabel="No events received for unknown numbers. Good."
          columns={[
            { key: "received_at", label: "Received", kind: "date" },
            { key: "meta_phone_number_id", label: "Phone Number ID", kind: "mono" },
            { key: "display_phone_number", label: "Number" },
            { key: "meta_waba_id", label: "WABA ID", kind: "mono" },
            { key: "resolved", label: "Resolved", kind: "bool" },
          ]}
        />
      </div>
    </>
  );
}
