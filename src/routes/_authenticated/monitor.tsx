import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { StatusBadge } from "@/components/azwa/status-badge";
import { Button } from "@/components/ui/button";
import { useNumbers, type WhatsappNumber } from "@/lib/azwa-data";
import { syncMetaLiveStatus } from "@/lib/meta/live-status.functions";
import { linkAllWabasWebhook } from "@/lib/meta/app-webhook.functions";
import { getPerNumberMessages24h } from "@/lib/monitor.functions";

export const Route = createFileRoute("/_authenticated/monitor")({
  head: () => ({
    meta: [
      { title: "Live Monitor — AzWA" },
      {
        name: "description",
        content:
          "Real-time operations monitor: Meta token, app webhook and WABA subscription status alongside per-number webhook, API health and message volume.",
      },
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
  const loadStats = useServerFn(getPerNumberMessages24h);
  const ids = numbers.map((number) => number.id).sort();
  return useQuery({
    queryKey: ["monitor-messages-today", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: () => loadStats({ data: { numberIds: ids } }),
    refetchInterval: 30_000,
  });
}

function MetaStatusSummary({ report }: { report: LiveReport }) {
  const subscribed = report.wabas.filter((waba) => waba.subscribed).length;
  const items: { label: string; value: string; badge: string }[] = [
    {
      label: "System user token",
      value: report.token ? (report.token.ok ? "Valid" : "Invalid") : "Not checked",
      badge: report.token?.ok ? "healthy" : "critical",
    },
    {
      label: "App webhook",
      value: report.webhook
        ? report.webhook.ok && report.webhook.healthy
          ? "Subscribed"
          : "Needs reconcile"
        : "Not checked",
      badge: report.webhook?.ok && report.webhook.healthy ? "healthy" : "warning",
    },
    {
      label: "WABA subscriptions",
      value: `${subscribed}/${report.wabas.length}`,
      badge: report.wabas.length > 0 && subscribed === report.wabas.length ? "healthy" : "warning",
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
        <div key={item.label} className="rounded-lg border border-border bg-background p-3">
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
  const { data: messageCounts = {} } = usePerNumberMessagesToday(numbers);

  const [report, setReport] = useState<LiveReport | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const runLink = useServerFn(linkAllWabasWebhook);
  const [linking, setLinking] = useState(false);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  async function linkAll() {
    setLinking(true);
    setLinkMsg(null);
    try {
      const r = await runLink({ data: {} });
      const failed = r.results.filter((x) => !x.ok).map((x) => `${x.name ?? x.waba}: ${x.error}`);
      setLinkMsg(
        `Linked ${r.linked}/${r.total} accounts.${failed.length ? " Failed: " + failed.join(" | ") : ""}`,
      );
    } catch (cause) {
      setLinkMsg(cause instanceof Error ? cause.message : "Linking failed");
    } finally {
      setLinking(false);
    }
  }

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
        description="Production Meta status and per-number health from authenticated server contracts."
        actions={
          <div className="flex gap-2">
            <Button type="button" onClick={() => void linkAll()} disabled={linking}>
              {linking ? "Linking…" : "Link all numbers to webhook"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void refresh()}
              disabled={syncing}
            >
              <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync live with Meta"}
            </Button>
          </div>
        }
      />

      <div className="space-y-6">
        {linkMsg ? <p className="rounded-md border p-3 text-sm">{linkMsg}</p> : null}
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
                {report.errors.length > 0 && ` — ${report.errors.length} issue(s) recorded.`}
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

        <WebhookSetupBoard numbers={numbers} report={report} />

        <Panel title="Phone numbers — live status">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Number</th>
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Enabled</th>
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
                {numbers.map((number) => {
                  const counts = messageCounts[number.id];
                  return (
                    <tr key={number.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{number.display_phone_number}</td>
                      <td className="py-2 pr-4">
                        {number.verified_name ?? number.internal_name ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge value={number.status} />
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge value={number.enabled ? "enabled" : "disabled"} />
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge value={number.health} />
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge value={number.webhook_status} />
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge value={number.api_health} />
                      </td>
                      <td className="py-2 pr-4 text-xs">{number.quality_rating ?? "—"}</td>
                      <td className="py-2 pr-4 font-semibold">{counts?.total ?? 0}</td>
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
            {!isLoading && numbers.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No WhatsApp numbers connected yet.
              </p>
            ) : null}
            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : null}
          </div>
        </Panel>
      </div>
    </>
  );
}

function timeAgo(value: string | null) {
  if (!value) return "لم تصل أي رسالة";
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `منذ ${hours} ساعة`;
  return `منذ ${Math.round(hours / 24)} يوم`;
}

function WebhookSetupBoard({
  numbers,
  report,
}: {
  numbers: WhatsappNumber[];
  report: LiveReport | null;
}) {
  const rows = numbers.map((n) => {
    const liveWaba = report?.wabas.find((w) => w.wabaId === n.waba_id);
    const linked = liveWaba ? liveWaba.subscribed : n.webhook_status === "active";
    return { n, linked, verifiedLive: Boolean(liveWaba) };
  });
  const unlinked = rows.filter((r) => !r.linked);

  return (
    <Panel title="حالة ربط Webhook لكل رقم">
      <div dir="rtl" className="space-y-4">
        {unlinked.length > 0 ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <strong>تنبيه:</strong> {unlinked.length} من {rows.length} رقم غير مربوط بالـ Webhook في
            Meta — لن تصل رسائلهم أو ملفاتهم:{" "}
            {unlinked.map((r) => r.n.display_phone_number).join("، ")}. اضغط "Link all numbers to
            webhook" بالأعلى.
          </div>
        ) : rows.length > 0 ? (
          <div className="rounded-md border border-success/40 bg-success/10 p-3 text-sm text-success">
            كل الأرقام مربوطة بالـ Webhook.
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ n, linked, verifiedLive }) => (
            <div
              key={n.id}
              className={`rounded-lg border p-3 ${linked ? "border-border bg-card" : "border-destructive/50 bg-destructive/5"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium" dir="ltr">
                  {n.display_phone_number}
                </span>
                <StatusBadge value={linked ? "active" : "disconnected"} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {n.verified_name ?? n.internal_name ?? "—"}
              </div>
              <div className="mt-2 text-xs">
                Webhook: {linked ? "مربوط" : "غير مربوط"}
                <span className="text-muted-foreground">
                  {verifiedLive ? " (تم التحقق من Meta)" : " (من آخر حالة محفوظة)"}
                </span>
              </div>
              <div className="mt-1 text-xs">
                آخر رسالة واردة:{" "}
                <span className={n.last_incoming_at ? "" : "text-warning-foreground"}>
                  {timeAgo(n.last_incoming_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
