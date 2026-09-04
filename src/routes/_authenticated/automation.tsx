import { createFileRoute } from "@tanstack/react-router";

import { AutomationRuleFormDialog } from "@/components/azwa/automation-rule-form";
import { PageHeader } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";

export const Route = createFileRoute("/_authenticated/automation")({
  head: () => ({ meta: [{ title: "Automation — AzWA" }] }),
  component: AutomationPage,
});

function AutomationPage() {
  return (
    <>
      <PageHeader
        title="Automation"
        description="Automation rules, scope, triggers and execution history."
        actions={<AutomationRuleFormDialog />}
      />
      <div className="grid gap-6">
        <RecordTable
          table="automation_rules"
          title="Automation rules"
          orderBy="updated_at"
          limit={200}
          columns={[
            { key: "name", label: "Rule" },
            { key: "trigger_type", label: "Trigger" },
            { key: "is_enabled", label: "Enabled", kind: "bool" },
            { key: "priority", label: "Priority" },
            { key: "scope_business_portfolio_id", label: "Business", kind: "mono" },
            { key: "scope_waba_id", label: "WABA", kind: "mono" },
            { key: "scope_whatsapp_number_id", label: "Number", kind: "mono" },
            { key: "conditions", label: "Conditions", kind: "json" },
            { key: "actions", label: "Actions", kind: "json" },
            { key: "updated_at", label: "Updated", kind: "date" },
          ]}
          emptyLabel="No automation rules configured yet."
        />
        <RecordTable
          table="automation_runs"
          title="Automation runs"
          orderBy="created_at"
          limit={300}
          columns={[
            { key: "created_at", label: "Created", kind: "date" },
            { key: "automation_rule_id", label: "Rule", kind: "mono" },
            { key: "status", label: "Status", kind: "status" },
            { key: "whatsapp_number_id", label: "Number", kind: "mono" },
            { key: "conversation_id", label: "Conversation", kind: "mono" },
            { key: "message_id", label: "Message", kind: "mono" },
            { key: "error", label: "Error" },
          ]}
          emptyLabel="No automation runs recorded yet."
        />
      </div>
    </>
  );
}
