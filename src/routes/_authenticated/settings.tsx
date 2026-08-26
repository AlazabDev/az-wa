import { createFileRoute } from "@tanstack/react-router";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — AzWA" },
      {
        name: "description",
        content:
          "Platform settings: Meta API version, retry policy, retention windows, alerting thresholds and integration configuration.",
      },
      { property: "og:title", content: "Settings — AzWA" },
      { property: "og:description", content: "Platform-wide operational settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Operational parameters are stored as data, not code, so behaviour can change without a deployment."
      />
      <Panel title="Required server secrets">
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            <span className="font-mono text-xs text-foreground">META_SYSTEM_USER_TOKEN</span> —
            fallback access token used when no scoped credential exists.
          </li>
          <li>
            <span className="font-mono text-xs text-foreground">META_APP_SECRET</span> — validates
            the X-Hub-Signature-256 header on incoming webhooks.
          </li>
          <li>
            <span className="font-mono text-xs text-foreground">META_WEBHOOK_VERIFY_TOKEN</span> —
            answers Meta's webhook verification challenge.
          </li>
        </ul>
      </Panel>
      <div className="mt-6">
        <RecordTable
          title="System settings"
          table="system_settings"
          orderBy="key"
          columns={[
            { key: "key", label: "Key", kind: "mono" },
            { key: "value", label: "Value", kind: "json" },
            { key: "description", label: "Description" },
          ]}
          emptyLabel="No overrides configured; defaults apply."
        />
      </div>
    </>
  );
}
