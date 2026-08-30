import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { useNumbers, useOpsCounters } from "@/lib/azwa-data";
import { numbersInScope, useScope } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — AzWA" }] }),
  component: AnalyticsPage,
});

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function AnalyticsPage() {
  const { scope } = useScope();
  const { data: allNumbers = [] } = useNumbers();
  const numbers = useMemo(() => numbersInScope(allNumbers, scope), [allNumbers, scope]);
  const { data: counters, isLoading } = useOpsCounters(numbers.map((n) => n.id));

  const delivered = counters?.delivered ?? 0;
  const sent = counters?.sent ?? 0;
  const read = counters?.read ?? 0;
  const incoming = counters?.incoming ?? 0;
  const outgoing = counters?.outgoing ?? 0;
  const deliveryRate = sent > 0 ? `${((delivered / sent) * 100).toFixed(1)}%` : "—";
  const readRate = delivered > 0 ? `${((read / delivered) * 100).toFixed(1)}%` : "—";
  const inboundShare = incoming + outgoing > 0 ? `${((incoming / (incoming + outgoing)) * 100).toFixed(1)}%` : "—";

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`Live 24-hour operational metrics for ${scope.label}. No exported snapshot is used on this page.`}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Messages (24h)" value={isLoading ? "…" : counters?.messagesToday ?? 0} />
        <Metric label="Incoming" value={counters?.incoming ?? 0} />
        <Metric label="Outgoing" value={counters?.outgoing ?? 0} />
        <Metric label="Failed" value={counters?.failed ?? 0} />
        <Metric label="Delivery rate" value={deliveryRate} />
        <Metric label="Read rate" value={readRate} />
        <Metric label="Inbound share" value={inboundShare} />
        <Metric label="Open conversations" value={counters?.openConversations ?? 0} />
        <Metric label="Media" value={counters?.mediaReceived ?? 0} />
        <Metric label="Approved templates" value={counters?.approvedTemplates ?? 0} />
        <Metric label="Running campaigns" value={counters?.runningCampaigns ?? 0} />
        <Metric label="Queue backlog" value={counters?.queueBacklog ?? 0} />
      </div>

      <div className="mt-6">
        <Panel title="Scope summary">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Numbers in scope" value={numbers.length} />
            <Metric label="API errors" value={counters?.apiErrors ?? 0} />
            <Metric label="Webhook errors" value={counters?.webhookErrors ?? 0} />
            <Metric label="Contacts" value={counters?.contacts ?? 0} />
          </div>
        </Panel>
      </div>
    </>
  );
}
