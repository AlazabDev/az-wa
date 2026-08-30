import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";

export const Route = createFileRoute("/_authenticated/media")({
  head: () => ({ meta: [{ title: "Media — AzWA" }] }),
  component: MediaPage,
});

function MediaPage() {
  return (
    <>
      <PageHeader
        title="Media"
        description="WhatsApp media lifecycle from Meta media ID through download attempts and permanent storage metadata."
      />
      <div className="grid gap-6">
        <RecordTable
          table="media"
          title="Media objects"
          orderBy="created_at"
          limit={300}
          columns={[
            { key: "created_at", label: "Received", kind: "date" },
            { key: "media_type", label: "Type", kind: "status" },
            { key: "mime_type", label: "MIME" },
            { key: "filename", label: "Filename" },
            { key: "file_size", label: "Bytes" },
            { key: "download_status", label: "Download", kind: "status" },
            { key: "storage_provider", label: "Storage" },
            { key: "storage_bucket", label: "Bucket", kind: "mono" },
            { key: "storage_path", label: "Path", kind: "mono" },
            { key: "last_error", label: "Last error" },
          ]}
          emptyLabel="No media objects recorded yet."
        />
        <RecordTable
          table="media_download_attempts"
          title="Download attempts"
          orderBy="started_at"
          limit={300}
          columns={[
            { key: "started_at", label: "Started", kind: "date" },
            { key: "completed_at", label: "Completed", kind: "date" },
            { key: "media_id", label: "Media", kind: "mono" },
            { key: "attempt_no", label: "Attempt" },
            { key: "status", label: "Status", kind: "status" },
            { key: "http_status", label: "HTTP" },
            { key: "error", label: "Error" },
          ]}
          emptyLabel="No media download attempts recorded yet."
        />
      </div>
    </>
  );
}
