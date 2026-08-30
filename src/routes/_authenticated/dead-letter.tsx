import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";

export const Route = createFileRoute("/_authenticated/dead-letter")({
  head: () => ({ meta: [{ title: "Dead Letter Queue — AzWA" }] }),
  component: DeadLetterPage,
});

function DeadLetterPage() {
  return (
    <>
      <PageHeader
        title="Dead Letter Queue"
        description="Jobs that exhausted normal processing and need explicit production review, retry or resolution."
      />
      <RecordTable
        table="dead_letter_jobs"
        orderBy="failed_at"
        limit={300}
        columns={[
          { key: "failed_at", label: "Failed", kind: "date" },
          { key: "queue_name", label: "Queue" },
          { key: "job_type", label: "Job type" },
          { key: "status", label: "Status", kind: "status" },
          { key: "attempts", label: "Attempts" },
          { key: "original_job_id", label: "Original job", kind: "mono" },
          { key: "last_error", label: "Last error" },
          { key: "payload", label: "Payload", kind: "json" },
        ]}
        emptyLabel="Dead letter queue is empty."
      />
    </>
  );
}
