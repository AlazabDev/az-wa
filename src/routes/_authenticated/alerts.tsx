import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({ meta: [{ title: "Alerts — AzWA" }] }),
  component: AlertsPage,
});

function AlertsPage() {
  return (
    <>
      <PageHeader
        title="Alerts"
        description="Operational alerts raised by Meta mapping, webhook, API, media and infrastructure health checks."
      />
      <RecordTable
        table="alerts"
        orderBy="created_at"
        limit={300}
        columns={[
          { key: "created_at", label: "When", kind: "date" },
          { key: "severity", label: "Severity", kind: "status" },
          { key: "alert_type", label: "Type" },
          { key: "title", label: "Title" },
          { key: "message", label: "Message" },
          { key: "status", label: "Status", kind: "status" },
          { key: "whatsapp_number_id", label: "Number", kind: "mono" },
          { key: "waba_id", label: "WABA", kind: "mono" },
          { key: "source_entity_type", label: "Source" },
        ]}
        emptyLabel="No alerts recorded."
      />
    </>
  );
}
