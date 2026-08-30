import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — AzWA" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Operational evidence tables used to verify delivery, health and campaign performance before accepting production."
      />
      <div className="grid gap-6">
        <RecordTable
          table="message_status_history"
          title="Message delivery history"
          orderBy="created_at"
          limit={400}
          columns={[
            { key: "created_at", label: "When", kind: "date" },
            { key: "message_id", label: "Message", kind: "mono" },
            { key: "status", label: "Status", kind: "status" },
            { key: "whatsapp_number_id", label: "Number", kind: "mono" },
            { key: "meta_timestamp", label: "Meta time", kind: "date" },
            { key: "payload", label: "Payload", kind: "json" },
          ]}
          emptyLabel="No message status history recorded yet."
        />
        <RecordTable
          table="health_checks"
          title="Health check history"
          orderBy="checked_at"
          limit={300}
          columns={[
            { key: "checked_at", label: "Checked", kind: "date" },
            { key: "check_type", label: "Check" },
            { key: "status", label: "Status", kind: "status" },
            { key: "whatsapp_number_id", label: "Number", kind: "mono" },
            { key: "waba_id", label: "WABA", kind: "mono" },
            { key: "latency_ms", label: "Latency (ms)" },
            { key: "message", label: "Message" },
          ]}
          emptyLabel="No health checks recorded yet."
        />
        <RecordTable
          table="campaigns"
          title="Campaign performance"
          orderBy="created_at"
          limit={200}
          columns={[
            { key: "created_at", label: "Created", kind: "date" },
            { key: "name", label: "Campaign" },
            { key: "status", label: "Status", kind: "status" },
            { key: "scheduled_at", label: "Scheduled", kind: "date" },
            { key: "completed_at", label: "Completed", kind: "date" },
            { key: "stats", label: "Stats", kind: "json" },
          ]}
          emptyLabel="No campaign reports yet."
        />
      </div>
    </>
  );
}
