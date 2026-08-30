import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";

export const Route = createFileRoute("/_authenticated/errors")({
  head: () => ({ meta: [{ title: "Errors — AzWA" }] }),
  component: ErrorsPage,
});

function ErrorsPage() {
  return (
    <>
      <PageHeader
        title="Errors"
        description="Open Meta API errors and failed webhook events for direct production diagnosis."
      />
      <div className="grid gap-6">
        <RecordTable
          table="api_errors"
          title="API errors"
          orderBy="created_at"
          limit={300}
          columns={[
            { key: "created_at", label: "When", kind: "date" },
            { key: "status", label: "Status", kind: "status" },
            { key: "error_type", label: "Type" },
            { key: "error_code", label: "Code" },
            { key: "title", label: "Title" },
            { key: "message", label: "Message" },
            { key: "whatsapp_number_id", label: "Number", kind: "mono" },
            { key: "waba_id", label: "WABA", kind: "mono" },
            { key: "raw_error", label: "Raw", kind: "json" },
          ]}
          emptyLabel="No API errors recorded."
        />
        <RecordTable
          table="webhook_events"
          title="Webhook events"
          orderBy="received_at"
          limit={300}
          columns={[
            { key: "received_at", label: "Received", kind: "date" },
            { key: "event_type", label: "Type" },
            { key: "status", label: "Status", kind: "status" },
            { key: "signature_valid", label: "Signature", kind: "bool" },
            { key: "whatsapp_number_id", label: "Number", kind: "mono" },
            { key: "meta_phone_number_id", label: "Meta phone", kind: "mono" },
            { key: "last_error", label: "Error" },
          ]}
          emptyLabel="No webhook events recorded."
        />
      </div>
    </>
  );
}
