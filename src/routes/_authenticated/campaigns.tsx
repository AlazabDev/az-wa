import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({ meta: [{ title: "Campaigns — AzWA" }] }),
  component: CampaignsPage,
});

function CampaignsPage() {
  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Campaign definitions, scheduling, execution state and recipient delivery records."
      />
      <div className="grid gap-6">
        <RecordTable
          table="campaigns"
          title="Campaigns"
          orderBy="created_at"
          limit={200}
          columns={[
            { key: "created_at", label: "Created", kind: "date" },
            { key: "name", label: "Name" },
            { key: "status", label: "Status", kind: "status" },
            { key: "sender_whatsapp_number_id", label: "Sender", kind: "mono" },
            { key: "template_id", label: "Template", kind: "mono" },
            { key: "scheduled_at", label: "Scheduled", kind: "date" },
            { key: "started_at", label: "Started", kind: "date" },
            { key: "completed_at", label: "Completed", kind: "date" },
            { key: "stats", label: "Stats", kind: "json" },
          ]}
          emptyLabel="No campaigns created yet."
        />
        <RecordTable
          table="campaign_recipients"
          title="Campaign recipients"
          orderBy="created_at"
          limit={400}
          columns={[
            { key: "created_at", label: "Queued", kind: "date" },
            { key: "campaign_id", label: "Campaign", kind: "mono" },
            { key: "recipient_address", label: "Recipient", kind: "mono" },
            { key: "status", label: "Status", kind: "status" },
            { key: "message_id", label: "Message", kind: "mono" },
            { key: "error_code", label: "Error code" },
            { key: "error_message", label: "Error" },
          ]}
          emptyLabel="No campaign recipients recorded yet."
        />
      </div>
    </>
  );
}
