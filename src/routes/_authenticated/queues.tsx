import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";

export const Route = createFileRoute("/_authenticated/queues")({
  head: () => ({
    meta: [
      { title: "Queues & Dead Letters — AzWA" },
      {
        name: "description",
        content:
          "Asynchronous job queue for webhook processing, sync, media download and campaign sends, with retry state and a dead-letter queue.",
      },
      { property: "og:title", content: "Queues & Dead Letters — AzWA" },
      { property: "og:description", content: "Async job queue and dead-letter inspection." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QueuesPage,
});

function QueuesPage() {
  return (
    <>
      <PageHeader
        title="Queues"
        description="Webhooks acknowledge instantly and enqueue work. Failures retry with backoff; exhausted jobs land in the dead-letter queue instead of disappearing."
      />
      <div className="space-y-6">
        <RecordTable
          title="Jobs"
          table="jobs"
          columns={[
            { key: "created_at", label: "Queued", kind: "date" },
            { key: "job_type", label: "Type" },
            { key: "status", label: "Status", kind: "status" },
            { key: "attempts", label: "Attempts" },
            { key: "max_attempts", label: "Max" },
            { key: "run_after", label: "Run after", kind: "date" },
            { key: "last_error", label: "Last error" },
          ]}
          emptyLabel="Queue is empty."
        />
        <RecordTable
          title="Dead letter queue"
          table="dead_letter_jobs"
          columns={[
            { key: "created_at", label: "Failed at", kind: "date" },
            { key: "job_type", label: "Type" },
            { key: "attempts", label: "Attempts" },
            { key: "error", label: "Error" },
            { key: "payload", label: "Payload", kind: "json" },
          ]}
          emptyLabel="No dead-lettered jobs."
        />
      </div>
    </>
  );
}
