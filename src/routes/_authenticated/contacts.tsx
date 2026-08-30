import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({ meta: [{ title: "Contacts — AzWA" }] }),
  component: ContactsPage,
});

function ContactsPage() {
  return (
    <>
      <PageHeader
        title="Contacts"
        description="Customer identity, WhatsApp addresses and ownership records used by conversations, campaigns and automation."
      />
      <div className="grid gap-6">
        <RecordTable
          table="contacts"
          title="Contacts"
          orderBy="last_interaction_at"
          limit={300}
          columns={[
            { key: "display_name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "company", label: "Company" },
            { key: "source", label: "Source" },
            { key: "status", label: "Status", kind: "status" },
            { key: "assigned_user_id", label: "Assigned user", kind: "mono" },
            { key: "assigned_team_id", label: "Assigned team", kind: "mono" },
            { key: "last_interaction_at", label: "Last interaction", kind: "date" },
          ]}
          emptyLabel="No contacts recorded yet."
        />
        <RecordTable
          table="contact_channels"
          title="Contact channels"
          orderBy="updated_at"
          limit={300}
          columns={[
            { key: "channel_type", label: "Channel", kind: "status" },
            { key: "address", label: "Address", kind: "mono" },
            { key: "wa_id", label: "WA ID", kind: "mono" },
            { key: "profile_name", label: "Profile name" },
            { key: "is_primary", label: "Primary", kind: "bool" },
            { key: "contact_id", label: "Contact", kind: "mono" },
            { key: "updated_at", label: "Updated", kind: "date" },
          ]}
          emptyLabel="No contact channels recorded yet."
        />
      </div>
    </>
  );
}
