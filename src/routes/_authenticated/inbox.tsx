import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [{ title: "Inbox — AzWA" }] }),
  component: InboxPage,
});

function InboxPage() {
  return (
    <>
      <PageHeader
        title="Inbox"
        description="Live operational view of WhatsApp conversations and message flow across the numbers you are allowed to access."
      />
      <div className="grid gap-6">
        <RecordTable
          table="conversations"
          title="Conversations"
          orderBy="last_message_at"
          limit={200}
          columns={[
            { key: "last_message_at", label: "Last message", kind: "date" },
            { key: "status", label: "Status", kind: "status" },
            { key: "priority", label: "Priority", kind: "status" },
            { key: "unread_count", label: "Unread" },
            { key: "whatsapp_number_id", label: "Number", kind: "mono" },
            { key: "contact_id", label: "Contact", kind: "mono" },
            { key: "assigned_user_id", label: "Assigned user", kind: "mono" },
            { key: "assigned_team_id", label: "Assigned team", kind: "mono" },
          ]}
          emptyLabel="No conversations received yet."
        />
        <RecordTable
          table="messages"
          title="Recent messages"
          orderBy="created_at"
          limit={300}
          columns={[
            { key: "created_at", label: "When", kind: "date" },
            { key: "direction", label: "Direction", kind: "status" },
            { key: "message_type", label: "Type" },
            { key: "body", label: "Message" },
            { key: "status", label: "Status", kind: "status" },
            { key: "whatsapp_number_id", label: "Number", kind: "mono" },
            { key: "contact_id", label: "Contact", kind: "mono" },
            { key: "meta_message_id", label: "Meta message", kind: "mono" },
          ]}
          emptyLabel="No messages recorded yet."
        />
      </div>
    </>
  );
}
