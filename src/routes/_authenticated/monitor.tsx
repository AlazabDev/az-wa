import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { StatusBadge } from "@/components/azwa/status-badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNumbers, type WhatsappNumber } from "@/lib/azwa-data";
import { syncMetaLiveStatus } from "@/lib/meta/live-status.functions";

export const Route = createFileRoute("/_authenticated/monitor")({
  head: () => ({
    meta: [
      { title: "Live Monitor — AzWA" },
      {
        name: "description",
        content:
          "Real-time operations monitor: Meta token, app webhook and WABA subscription status alongside per-number webhook, API health and message volume.",
      },
      { property: "og:title", content: "Live Monitor — AzWA" },
      {
        property: "og:description",
        content: "Real-time WhatsApp infrastructure monitoring.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MonitorPage,
});

type LiveReport = {
  ok: boolean;
  checkedAt: string;
  token: { ok: boolean; errors: string[] } | null;
  webhook: {
    ok: boolean;
    healthy?: boolean;
    error?: string;
    missingFields?: string[];
  } | null;
  wabas: {
    wabaId: string;
    metaWabaId: string;
    name: string | null;
    subscribed: boolean;
  }[];
  errors: string[];
};

function usePerNumberMessagesToday(numbers: WhatsappNumber[]) {
  const ids = numbers.map((n) => n.id).sort();
  return useQuery({
    queryKey: ["monitor-messages-today", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("messages")
        .select("whatsapp_number_id, direction, status")
        .in("whatsapp_number_id", ids)
        .gte("created_at", since)
        .limit(10000);
      if (error) throw error;
      const counts = new Map<
        string,
        { total: number; incoming: number; outgoing: number; failed: number }
      >();
      for (const row of data ?? []) {
        const id = row.whatsapp_number_id as string;
        const entry = counts.get(id) ?? {
          total: 0,
          incoming: 0,
          outgoing: 0,
          failed: 0,
        };
        entry.total += 1;
        if (row.direction === "incoming") entry.incoming += 1;
        if (row.direction === "outgoing") entry.outgoing += 1;
        if (row.status === "failed") entry.failed += 1;
        counts.set(id, entry);
      }
      return counts;
    },
    refetchInterval: 30_000,
  });
}

function MetaStatusSummary({ report }: { report: LiveReport }) {
  const subscribed = report.wabas.filter((w) => w.subscribed).length;
  const items: { label: string; value: string; badge: string }[] = [
    {
      label: "System user token",
      value: report.token
        ? report.token.ok
          ? "Valid"
          : "Invalid"
        : "Not checked",
      badge: report.token?.ok ? "healthy" : "critical",
    },
    {
      label: "App webhook",
      value: report.webhook
        ? report.webhook.ok && report.webhook.healthy
          ? "Subscribed"
          : "Needs reconcile"
        : "Not checked",
      badge:
        report.webhook?.ok && report.webhook.healthy ? "healthy" : "warning",
    },
    {
      label: "WABA subscriptions",
      value: `${subscribed}/${report.wabas.length}`,
      badge:
        report.wabas.length > 0 && subscribed === report.wabas.length
          ? "healthy"
          : "warning",
    },
    {
      label: "Overall",
      value: report.ok ? "Operational" : "Issues detected",
      badge: report.ok ? "healthy" : "critical",
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-border bg-background p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <StatusBadge value={item.badge} />
          </div>
          <div className="mt-1.5 text-sm font-semibold">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function MonitorPage() {
  const runSync = useServerFn(syncMetaLiveStatus);
  const { data: numbers = [], isLoading } = useNumbers();
  const { data: messageCounts } = usePerNumberMessagesToday(numbers);

  const [report, setReport] = useState<LiveReport | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function refresh() {
    setSyncing(true);
    setSyncError(null);
    try {
      setReport((await runSync({ data: {} })) as LiveReport);
    } catch (cause) {
      setSyncError(cause instanceof Error ? cause.message : "Live sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Live Monitor"
        description="One view of production Meta status and per-number health: webhook delivery, API reachability and today's message volume."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => void refresh()}
            disabled={syncing}
          >
            <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync live with Meta"}
          </Button>
        }
      />

      <div className="space-y-6">
        <Panel title="Live Meta status">
          {syncError ? (
            <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {syncError}
            </p>
          ) : null}
          {report ? (
            <>
              <MetaStatusSummary report={report} />
              <p className="mt-3 text-xs text-muted-foreground">
                Last checked {new Date(report.checkedAt).toLocaleString()}
                {report.errors.length > 0 &&
                  ` — ${report.errors.length} issue(s) recorded.`}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {syncing
                ? "Checking token, webhook and WABA subscriptions against Meta…"
                : "Run a live sync to verify the production Meta connection."}
            </p>
          )}
        </Panel>

        <Panel title="Phone numbers — live status">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Number</th>
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Health</th>
                  <th className="py-2 pr-4 font-medium">Webhook</th>
                  <th className="py-2 pr-4 font-medium">API Health</th>
                  <th className="py-2 pr-4 font-medium">Quality</th>
                  <th className="py-2 pr-4 font-medium">Msgs (24h)</th>
                  <th className="py-2 pr-4 font-medium">In / Out</th>
                  <th className="py-2 pr-4 font-medium">Failed</th>
                </tr>
              </thead>
              <tbody>
                {numbers.map((n) => {
                  const counts = messageCounts?.get(n.id);
                  return (
                    <tr
                      key={n.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="py-2 pr-4 font-mono text-xs">
                        {n.display_phone_number}
                      </td>
                      <td className="py-2 pr-4">
                        {n.verified_name ?? n.internal_name ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge value={n.status} />
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge value={n.health} />
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge value={n.webhook_status} />
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge value={n.api_health} />
                      </td>
                      <td className="py-2 pr-4 text-xs">
                        {n.quality_rating ?? "—"}
                      </td>
                      <td className="py-2 pr-4 font-semibold">
                        {counts?.total ?? 0}
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {counts ? `${counts.incoming} / ${counts.outgoing}` : "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {counts?.failed ? (
                          <span className="text-xs font-medium text-destructive">
                            {counts.failed}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!isLoading && numbers.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No WhatsApp numbers connected yet.
              </p>
            )}
            {isLoading && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Loading…
              </p>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
