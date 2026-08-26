import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Audit Log — AzWA" },
      {
        name: "description",
        content:
          "Immutable audit trail of every administrative action: syncs, credential changes, sends, template edits and access changes.",
      },
      { property: "og:title", content: "Audit Log — AzWA" },
      { property: "og:description", content: "Immutable trail of administrative actions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Who did what, to which resource, and when — retained for compliance review."
      />
      <RecordTable
        table="audit_logs"
        columns={[
          { key: "created_at", label: "When", kind: "date" },
          { key: "actor_id", label: "Actor", kind: "mono" },
          { key: "action", label: "Action" },
          { key: "resource_type", label: "Resource" },
          { key: "resource_id", label: "Resource ID", kind: "mono" },
          { key: "metadata", label: "Details", kind: "json" },
        ]}
        emptyLabel="No audited actions yet."
      />
    </>
  );
}
