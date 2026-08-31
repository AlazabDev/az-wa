import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";

export const Route = createFileRoute("/_authenticated/health")({
  head: () => ({
    meta: [
      { title: "Health & Diagnostics — AzWA" },
      {
        name: "description",
        content:
          "Continuous health checks per number and WABA: API reachability, webhook delivery, token validity, quality rating and messaging limits.",
      },
      { property: "og:title", content: "Health & Diagnostics — AzWA" },
      {
        property: "og:description",
        content: "Continuous health checks for WhatsApp infrastructure.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HealthPage,
});

function HealthPage() {
  return (
    <>
      <PageHeader
        title="Health & Diagnostics"
        description="Every diagnostic run is persisted so degradation can be traced over time rather than guessed at."
      />
      <div className="space-y-6">
        <RecordTable
          title="Health check history"
          table="health_checks"
          orderBy="checked_at"
          columns={[
            { key: "checked_at", label: "Checked", kind: "date" },
            { key: "scope", label: "Scope" },
            { key: "check_name", label: "Check" },
            { key: "status", label: "Result", kind: "status" },
            { key: "latency_ms", label: "Latency (ms)" },
            { key: "detail", label: "Detail" },
          ]}
        />
        <RecordTable
          title="Open API errors"
          table="api_errors"
          columns={[
            { key: "created_at", label: "When", kind: "date" },
            { key: "error_code", label: "Code", kind: "mono" },
            { key: "error_type", label: "Type" },
            { key: "message", label: "Message" },
            { key: "occurrences", label: "Count" },
            { key: "status", label: "Status", kind: "status" },
          ]}
          emptyLabel="No API errors recorded."
        />
        <RecordTable
          title="Alerts"
          table="alerts"
          columns={[
            { key: "created_at", label: "Raised", kind: "date" },
            { key: "severity", label: "Severity", kind: "status" },
            { key: "alert_type", label: "Type" },
            { key: "title", label: "Title" },
            { key: "status", label: "Status", kind: "status" },
          ]}
          emptyLabel="No alerts raised."
        />
      </div>
    </>
  );
}
