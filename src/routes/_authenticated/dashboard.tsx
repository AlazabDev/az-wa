import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { StatusBadge } from "@/components/azwa/status-badge";
import { useNumbers, usePortfolios, useWabas, useOpsCounters } from "@/lib/azwa-data";
import { numbersInScope, useScope } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Operations Overview — AzWA" },
      {
        name: "description",
        content:
          "Aggregated WhatsApp operations overview across every business portfolio, WABA and phone number.",
      },
      { property: "og:title", content: "Operations Overview — AzWA" },
      { property: "og:description", content: "Aggregated multi-WABA WhatsApp operations metrics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${tone ?? "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function Dashboard() {
  const { scope } = useScope();
  const { data: portfolios = [] } = usePortfolios();
  const { data: wabas = [] } = useWabas();
  const { data: allNumbers = [], isLoading } = useNumbers();

  const numbers = useMemo(() => numbersInScope(allNumbers, scope), [allNumbers, scope]);
  const { data: counters } = useOpsCounters(numbers.map((n) => n.id));

  const scopedWabas =
    scope.kind === "all"
      ? wabas
      : wabas.filter((w) => numbers.some((n) => n.waba_id === w.id) || w.id === scope.id);

  const healthy = numbers.filter((n) => n.health === "healthy").length;
  const warning = numbers.filter((n) => n.health === "warning").length;
  const critical = numbers.filter((n) => n.health === "critical").length;
  const unknown = numbers.filter((n) => n.health === "unknown" || n.health === "offline").length;

  return (
    <>
      <PageHeader
        title="Operations Overview"
        description={`Scope: ${scope.label}. Metrics below are aggregated over the numbers inside the selected scope.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Metric label="Business Portfolios" value={scope.kind === "all" ? portfolios.length : 1} />
        <Metric label="WABAs" value={scopedWabas.length} />
        <Metric label="WhatsApp Numbers" value={isLoading ? "…" : numbers.length} />
        <Metric label="Healthy" value={healthy} tone="text-success" />
        <Metric label="Warning" value={warning} tone="text-warning-foreground" />
        <Metric label="Critical / Unknown" value={critical + unknown} tone="text-destructive" />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Metric label="Messages (24h)" value={counters?.messagesToday ?? 0} />
        <Metric label="Incoming" value={counters?.incoming ?? 0} />
        <Metric label="Outgoing" value={counters?.outgoing ?? 0} />
        <Metric label="Sent" value={counters?.sent ?? 0} />
        <Metric label="Delivered" value={counters?.delivered ?? 0} />
        <Metric label="Read" value={counters?.read ?? 0} />
        <Metric label="Failed" value={counters?.failed ?? 0} tone="text-destructive" />
        <Metric label="Open Conversations" value={counters?.openConversations ?? 0} />
        <Metric label="Contacts" value={counters?.contacts ?? 0} />
        <Metric label="Media Received" value={counters?.mediaReceived ?? 0} />
        <Metric label="Templates" value={counters?.templates ?? 0} />
        <Metric label="Approved Templates" value={counters?.approvedTemplates ?? 0} />
        <Metric label="Rejected Templates" value={counters?.rejectedTemplates ?? 0} />
        <Metric label="Running Campaigns" value={counters?.runningCampaigns ?? 0} />
        <Metric
          label="Webhook Errors"
          value={counters?.webhookErrors ?? 0}
          tone="text-destructive"
        />
        <Metric label="API Errors" value={counters?.apiErrors ?? 0} tone="text-destructive" />
        <Metric label="Queue Backlog" value={counters?.queueBacklog ?? 0} />
      </div>

      <div className="mt-6">
        <Panel title="Numbers in scope">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Number</th>
                  <th className="py-2 pr-4 font-medium">Phone Number ID</th>
                  <th className="py-2 pr-4 font-medium">WABA</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">API</th>
                  <th className="py-2 pr-4 font-medium">Health</th>
                </tr>
              </thead>
              <tbody>
                {numbers.map((n) => {
                  const waba = wabas.find((w) => w.id === n.waba_id);
                  return (
                    <tr key={n.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-4 font-medium">{n.display_phone_number}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                        {n.meta_phone_number_id}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                        {waba?.meta_waba_id ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge value={n.status} />
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge value={n.api_health} />
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge value={n.health} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
