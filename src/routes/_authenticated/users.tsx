import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Users & Roles — AzWA" },
      {
        name: "description",
        content:
          "Role-based access control: admins, supervisors and agents, with per-portfolio, per-WABA and per-number access scoping.",
      },
      { property: "og:title", content: "Users & Roles — AzWA" },
      { property: "og:description", content: "RBAC and access scoping for the control plane." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  return (
    <>
      <PageHeader
        title="Users & Roles"
        description="Roles live in a dedicated table, never on the profile row, and every data policy checks them through a security-definer function."
      />
      <div className="space-y-6">
        <RecordTable
          title="Profiles"
          table="profiles"
          columns={[
            { key: "created_at", label: "Joined", kind: "date" },
            { key: "full_name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "id", label: "User ID", kind: "mono" },
          ]}
        />
        <RecordTable
          title="Role assignments"
          table="user_roles"
          columns={[
            { key: "created_at", label: "Granted", kind: "date" },
            { key: "user_id", label: "User ID", kind: "mono" },
            { key: "role", label: "Role", kind: "status" },
          ]}
          emptyLabel="No roles granted yet."
        />
      </div>
    </>
  );
}
