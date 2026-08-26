import { createFileRoute } from "@tanstack/react-router";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";

export const Route = createFileRoute("/_authenticated/credentials")({
  head: () => ({
    meta: [
      { title: "Credentials — AzWA" },
      {
        name: "description",
        content:
          "Access-token registry per business portfolio, WABA or phone number, with scope, expiry and validation state. Token values never reach the browser.",
      },
      { property: "og:title", content: "Credentials — AzWA" },
      { property: "og:description", content: "Hierarchical Meta credential registry." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CredentialsPage,
});

function CredentialsPage() {
  return (
    <>
      <PageHeader
        title="Credentials"
        description="Tokens resolve most-specific-first: phone number → WABA → business portfolio → system token. Values are stored server-side and are never exposed to the client."
      />
      <Panel title="Resolution order">
        <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
          <li>Credential bound to the specific phone number</li>
          <li>Credential bound to the owning WABA</li>
          <li>Credential bound to the business portfolio</li>
          <li>System-wide META_SYSTEM_USER_TOKEN environment secret</li>
        </ol>
      </Panel>
      <div className="mt-6">
        <RecordTable
          title="Registered credentials"
          table="meta_credentials"
          columns={[
            { key: "created_at", label: "Added", kind: "date" },
            { key: "label", label: "Label" },
            { key: "scope", label: "Scope" },
            { key: "token_type", label: "Token type" },
            { key: "status", label: "Status", kind: "status" },
            { key: "expires_at", label: "Expires", kind: "date" },
            { key: "last_validated_at", label: "Last validated", kind: "date" },
          ]}
          emptyLabel="No credential rows. The system token from environment secrets is being used."
        />
      </div>
    </>
  );
}
