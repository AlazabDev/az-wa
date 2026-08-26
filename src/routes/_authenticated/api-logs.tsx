import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";

export const Route = createFileRoute("/_authenticated/api-logs")({
  head: () => ({
    meta: [
      { title: "API Logs — AzWA" },
      {
        name: "description",
        content:
          "Every Meta Graph API request made by the platform, with endpoint, method, status, latency and error payload for full auditability.",
      },
      { property: "og:title", content: "API Logs — AzWA" },
      { property: "og:description", content: "Full log of outbound Meta Graph API requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApiLogsPage,
});

function ApiLogsPage() {
  return (
    <>
      <PageHeader
        title="Meta API Requests"
        description="No Graph API call happens without a log entry. Use this when Meta behaviour and platform behaviour disagree."
      />
      <RecordTable
        table="api_requests"
        columns={[
          { key: "created_at", label: "When", kind: "date" },
          { key: "method", label: "Method" },
          { key: "endpoint", label: "Endpoint", kind: "mono" },
          { key: "status_code", label: "Status" },
          { key: "success", label: "Result", kind: "bool" },
          { key: "duration_ms", label: "Duration (ms)" },
          { key: "error_message", label: "Error" },
        ]}
        emptyLabel="No API calls recorded yet."
      />
    </>
  );
}
