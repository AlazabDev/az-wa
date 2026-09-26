import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { useNumbers, useOpsCounters } from "@/lib/azwa-data";
import { numbersInScope, useScope } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — AzWA" }] }),
  component: AnalyticsPage,
});

// ─── Tiny metric card ─────────────────────────────────────────────────────────

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: string | undefined }) {
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

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg text-xs">
      {label && <p className="mb-1 font-semibold text-foreground">{label}</p>}
      {payload.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: <span className="font-semibold tabular-nums">{entry.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

// ─── Palette ──────────────────────────────────────────────────────────────────

const COLORS = {
  sent: "#3b82f6",
  delivered: "#10b981",
  read: "#6366f1",
  failed: "#ef4444",
  incoming: "#f59e0b",
  outgoing: "#8b5cf6",
};

const PIE_COLORS = ["#10b981", "#3b82f6", "#6366f1", "#ef4444", "#f59e0b"];

// ─── Page ─────────────────────────────────────────────────────────────────────

function AnalyticsPage() {
  const { scope } = useScope();
  const { data: allNumbers = [] } = useNumbers();
  const numbers = useMemo(() => numbersInScope(allNumbers, scope), [allNumbers, scope]);
  const { data: counters, isLoading } = useOpsCounters(numbers.map((n) => n.id));

  // Derived values
  const delivered = counters?.delivered ?? 0;
  const sent = counters?.sent ?? 0;
  const read = counters?.read ?? 0;
  const failed = counters?.failed ?? 0;
  const incoming = counters?.incoming ?? 0;
  const outgoing = counters?.outgoing ?? 0;

  const deliveryRate = sent > 0 ? `${((delivered / sent) * 100).toFixed(1)}%` : "—";
  const readRate = delivered > 0 ? `${((read / delivered) * 100).toFixed(1)}%` : "—";
  const inboundShare =
    incoming + outgoing > 0 ? `${((incoming / (incoming + outgoing)) * 100).toFixed(1)}%` : "—";
  const failRate = sent > 0 ? `${((failed / sent) * 100).toFixed(1)}%` : "—";

  // Bar chart: message flow
  const flowData = [
    { name: "Sent", value: sent, fill: COLORS.sent },
    { name: "Delivered", value: delivered, fill: COLORS.delivered },
    { name: "Read", value: read, fill: COLORS.read },
    { name: "Failed", value: failed, fill: COLORS.failed },
  ];

  // Bar chart: direction
  const directionData = [
    { name: "Incoming", value: incoming, fill: COLORS.incoming },
    { name: "Outgoing", value: outgoing, fill: COLORS.outgoing },
  ];

  // Pie chart: status breakdown (exclude failed=0)
  const pieData = flowData.filter((d) => d.value > 0);

  // Health breakdown
  const healthData = [
    { name: "Healthy", value: numbers.filter((n) => n.health === "healthy").length, fill: "#10b981" },
    { name: "Warning", value: numbers.filter((n) => n.health === "warning").length, fill: "#f59e0b" },
    { name: "Critical", value: numbers.filter((n) => n.health === "critical").length, fill: "#ef4444" },
    { name: "Unknown", value: numbers.filter((n) => n.health === "unknown").length, fill: "#6b7280" },
  ].filter((d) => d.value > 0);

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`Live 24-hour operational metrics for ${scope.label}. Data is pulled from the live database.`}
      />

      {/* KPI grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Messages (24h)" value={isLoading ? "…" : (counters?.messagesToday ?? 0)} />
        <Metric label="Delivery rate" value={deliveryRate} tone="text-emerald-600" />
        <Metric label="Read rate" value={readRate} tone="text-indigo-600" />
        <Metric label="Failure rate" value={failRate} tone={failed > 0 ? "text-destructive" : undefined} />
        <Metric label="Incoming" value={incoming} tone="text-amber-600" />
        <Metric label="Outgoing" value={outgoing} tone="text-violet-600" />
        <Metric label="Inbound share" value={inboundShare} />
        <Metric label="Open conversations" value={counters?.openConversations ?? 0} />
      </div>

      {/* Charts row */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Message flow bar chart */}
        <Panel title="Message funnel (24h)">
          {flowData.every((d) => d.value === 0) ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No messages in the last 24 hours.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={flowData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]}>
                  {flowData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* Direction bar chart */}
        <Panel title="Traffic direction (24h)">
          {incoming + outgoing === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No traffic in the last 24 hours.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={directionData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                <Bar dataKey="value" name="Messages" radius={[4, 4, 0, 0]}>
                  {directionData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* Status pie chart */}
        <Panel title="Message status distribution">
          {pieData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, percent }) =>
                    percent > 0.04 ? `${name} ${(percent * 100).toFixed(0)}%` : ""
                  }
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value) => <span className="text-foreground">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* Number health pie */}
        <Panel title="Number health distribution">
          {healthData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No numbers in scope.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={healthData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {healthData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value) => <span className="text-foreground">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      {/* Bottom metrics */}
      <div className="mt-6">
        <Panel title="Scope summary">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Numbers in scope" value={numbers.length} />
            <Metric label="Templates" value={counters?.templates ?? 0} />
            <Metric label="Approved templates" value={counters?.approvedTemplates ?? 0} tone="text-emerald-600" />
            <Metric label="Contacts" value={counters?.contacts ?? 0} />
            <Metric label="Running campaigns" value={counters?.runningCampaigns ?? 0} tone="text-amber-600" />
            <Metric label="Media received" value={counters?.mediaReceived ?? 0} />
            <Metric label="API errors" value={counters?.apiErrors ?? 0} tone={counters?.apiErrors ? "text-destructive" : undefined} />
            <Metric label="Webhook errors" value={counters?.webhookErrors ?? 0} tone={counters?.webhookErrors ? "text-destructive" : undefined} />
          </div>
        </Panel>
      </div>
    </>
  );
}
