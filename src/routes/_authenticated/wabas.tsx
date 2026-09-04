import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { StatusBadge } from "@/components/azwa/status-badge";
import { useNumbers, usePortfolios, useWabas } from "@/lib/azwa-data";
import {
  useWabaAssignedUsers,
  useWabaInventoryExtras,
  useWabaSubscribedApps,
  useWhatsappFlows,
} from "@/lib/meta/inventory-data";
import { getWabaStats } from "@/lib/meta/waba-stats.functions";
import { useScope } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/wabas")({
  head: () => ({
    meta: [
      { title: "WABAs — AzWA" },
      {
        name: "description",
        content:
          "Every WhatsApp Business Account with numbers, templates, Flows, subscribed apps, assigned users and operational health.",
      },
    ],
  }),
  component: WabasPage,
});

function WabasPage() {
  const { scope } = useScope();
  const { data: wabas = [] } = useWabas();
  const { data: numbers = [] } = useNumbers();
  const { data: portfolios = [] } = usePortfolios();
  const { data: flows = [] } = useWhatsappFlows();
  const { data: subscribedApps = [] } = useWabaSubscribedApps();
  const { data: assignedUsers = [] } = useWabaAssignedUsers();
  const { data: wabaExtras = {} } = useWabaInventoryExtras();
  const loadWabaStats = useServerFn(getWabaStats);
  const { data: perWaba = {} } = useQuery({
    queryKey: ["waba-stats"],
    queryFn: () => loadWabaStats({ data: {} }),
    refetchInterval: 30_000,
  });

  const visible = wabas.filter((waba) => {
    if (scope.kind === "all") return true;
    if (scope.kind === "business") return waba.business_portfolio_id === scope.id;
    if (scope.kind === "waba") return waba.id === scope.id;
    return numbers.some((number) => number.id === scope.id && number.waba_id === waba.id);
  });

  const visibleWabaIds = new Set(visible.map((waba) => waba.id));
  const visibleApps = subscribedApps.filter((app) => visibleWabaIds.has(app.waba_id));
  const visibleUsers = assignedUsers.filter((user) => visibleWabaIds.has(user.waba_id));

  return (
    <>
      <PageHeader
        title="WhatsApp Business Accounts"
        description="Live WABA inventory from the clean AzWA backend. Missing assets remain visible instead of being fabricated or silently removed."
      />

      <Panel title="WABA inventory">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                <th className="py-2 pr-4 font-medium">WABA ID</th>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Business</th>
                <th className="py-2 pr-4 font-medium">Namespace</th>
                <th className="py-2 pr-4 font-medium">Currency / TZ</th>
                <th className="py-2 pr-4 font-medium">Numbers</th>
                <th className="py-2 pr-4 font-medium">Templates</th>
                <th className="py-2 pr-4 font-medium">Flows</th>
                <th className="py-2 pr-4 font-medium">Apps</th>
                <th className="py-2 pr-4 font-medium">AzWA</th>
                <th className="py-2 pr-4 font-medium">Users</th>
                <th className="py-2 pr-4 font-medium">Messages</th>
                <th className="py-2 pr-4 font-medium">Open Errors</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Health</th>
                <th className="py-2 pr-4 font-medium">Last Sync</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((waba) => {
                const portfolio = portfolios.find((item) => item.id === waba.business_portfolio_id);
                const extra = wabaExtras[waba.id];
                const wabaNumbers = numbers.filter((number) => number.waba_id === waba.id);
                const wabaApps = subscribedApps.filter(
                  (app) => app.waba_id === waba.id && app.status === "active",
                );
                const stats = perWaba[waba.id] ?? {
                  templates: 0,
                  messages: 0,
                  openErrors: 0,
                };

                return (
                  <tr key={waba.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">{waba.meta_waba_id}</td>
                    <td className="py-2 pr-4">{waba.name ?? "—"}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                      {portfolio?.meta_business_id ?? "—"}
                    </td>
                    <td className="max-w-56 truncate py-2 pr-4 font-mono text-xs text-muted-foreground">
                      {extra?.message_template_namespace ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {[extra?.currency, extra?.timezone].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{wabaNumbers.length}</td>
                    <td className="py-2 pr-4 tabular-nums">{stats.templates}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      {
                        flows.filter(
                          (flow) => flow.waba_id === waba.id && flow.status !== "MISSING_FROM_META",
                        ).length
                      }
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{wabaApps.length}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge
                        value={wabaApps.some((app) => app.is_azwa) ? "healthy" : "critical"}
                      />
                    </td>
                    <td className="py-2 pr-4 tabular-nums">
                      {
                        assignedUsers.filter(
                          (user) => user.waba_id === waba.id && user.status === "active",
                        ).length
                      }
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{stats.messages}</td>
                    <td className="py-2 pr-4 tabular-nums">{stats.openErrors}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge value={waba.status} />
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge value={waba.health} />
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {waba.last_synced_at
                        ? new Date(waba.last_synced_at).toLocaleString()
                        : "Never"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Subscribed Meta apps">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                <th className="py-2 pr-4 font-medium">WABA</th>
                <th className="py-2 pr-4 font-medium">Application</th>
                <th className="py-2 pr-4 font-medium">App ID</th>
                <th className="py-2 pr-4 font-medium">Namespace</th>
                <th className="py-2 pr-4 font-medium">Category</th>
                <th className="py-2 pr-4 font-medium">Override callback</th>
                <th className="py-2 pr-4 font-medium">AzWA</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Last Sync</th>
              </tr>
            </thead>
            <tbody>
              {visibleApps.map((app) => {
                const waba = wabas.find((item) => item.id === app.waba_id);
                return (
                  <tr key={app.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 text-xs">
                      <div>{waba?.name ?? "Unknown WABA"}</div>
                      <div className="font-mono text-muted-foreground">
                        {waba?.meta_waba_id ?? app.waba_id}
                      </div>
                    </td>
                    <td className="py-2 pr-4">{app.app_name ?? "Unnamed app"}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{app.meta_app_id}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                      {app.app_namespace ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-xs">{app.app_category ?? "—"}</td>
                    <td className="max-w-80 truncate py-2 pr-4 font-mono text-xs text-muted-foreground">
                      {app.override_callback_uri ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge value={app.is_azwa ? "healthy" : "unknown"} />
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge value={app.status} />
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {app.last_synced_at ? new Date(app.last_synced_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleApps.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No subscribed-app inventory is available in this scope yet.
            </p>
          ) : null}
        </div>
      </Panel>

      <Panel title="Assigned users and tasks">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                <th className="py-2 pr-4 font-medium">WABA</th>
                <th className="py-2 pr-4 font-medium">User</th>
                <th className="py-2 pr-4 font-medium">Meta User ID</th>
                <th className="py-2 pr-4 font-medium">Tasks</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Last Sync</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => {
                const waba = wabas.find((item) => item.id === user.waba_id);
                return (
                  <tr key={user.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 text-xs">
                      <div>{waba?.name ?? "Unknown WABA"}</div>
                      <div className="font-mono text-muted-foreground">
                        {waba?.meta_waba_id ?? user.waba_id}
                      </div>
                    </td>
                    <td className="py-2 pr-4">{user.name ?? "Unnamed user"}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{user.meta_user_id}</td>
                    <td className="py-2 pr-4 text-xs">{user.tasks?.join(", ") || "—"}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge value={user.status} />
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {user.last_synced_at ? new Date(user.last_synced_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleUsers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Assigned-user state is not authoritative yet; the audited Meta edge returned
              permission errors and is intentionally not treated as zero.
            </p>
          ) : null}
        </div>
      </Panel>
    </>
  );
}
