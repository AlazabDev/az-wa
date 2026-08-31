import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { StatusBadge } from "@/components/azwa/status-badge";
import { useNumbers, usePortfolios, useWabas } from "@/lib/azwa-data";
import {
  useWabaAssignedUsers,
  useWabaInventoryExtras,
  useWabaSubscribedApps,
  useWhatsappFlows,
} from "@/lib/meta/inventory-data";
import { supabase } from "@/integrations/supabase/client";
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

  const { data: perWaba } = useQuery({
    queryKey: ["waba-stats"],
    queryFn: async () => {
      const [{ data: templates }, { data: messages }, { data: errors }] = await Promise.all([
        supabase.from("templates").select("waba_id, status"),
        supabase.from("messages").select("whatsapp_number_id"),
        supabase.from("api_errors").select("waba_id").eq("status", "open"),
      ]);
      return { templates: templates ?? [], messages: messages ?? [], errors: errors ?? [] };
    },
  });

  const visible = wabas.filter((w) => {
    if (scope.kind === "all") return true;
    if (scope.kind === "business") return w.business_portfolio_id === scope.id;
    if (scope.kind === "waba") return w.id === scope.id;
    return numbers.some((n) => n.id === scope.id && n.waba_id === w.id);
  });
  const visibleWabaIds = new Set(visible.map((waba) => waba.id));
  const visibleApps = subscribedApps.filter((app) => visibleWabaIds.has(app.waba_id));
  const visibleUsers = assignedUsers.filter((user) => visibleWabaIds.has(user.waba_id));

  return (
    <>
      <PageHeader
        title="WhatsApp Business Accounts"
        description="Live WABA inventory from Meta Graph API v26. Missing assets are retained and marked instead of deleted."
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
                <th className="py-2 pr-4 font-medium">Errors</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Health</th>
                <th className="py-2 pr-4 font-medium">Last Sync</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((w) => {
                const portfolio = portfolios.find((p) => p.id === w.business_portfolio_id);
                const extra = wabaExtras[w.id];
                const wabaNumberIds = new Set(
                  numbers.filter((n) => n.waba_id === w.id).map((n) => n.id),
                );
                const wabaApps = subscribedApps.filter(
                  (app) => app.waba_id === w.id && app.status === "active",
                );
                const messageCount = (perWaba?.messages ?? []).filter(
                  (message) =>
                    message.whatsapp_number_id !== null &&
                    wabaNumberIds.has(message.whatsapp_number_id),
                ).length;
                return (
                  <tr key={w.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">{w.meta_waba_id}</td>
                    <td className="py-2 pr-4">{w.name ?? "—"}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                      {portfolio?.meta_business_id ?? "—"}
                    </td>
                    <td className="max-w-56 truncate py-2 pr-4 font-mono text-xs text-muted-foreground">
                      {extra?.message_template_namespace ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {[extra?.currency, extra?.timezone].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{wabaNumberIds.size}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      {(perWaba?.templates ?? []).filter((t) => t.waba_id === w.id).length}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">
                      {
                        flows.filter(
                          (flow) =>
                            flow.waba_id === w.id && flow.status !== "MISSING_FROM_META",
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
                          (user) => user.waba_id === w.id && user.status === "active",
                        ).length
                      }
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{messageCount}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      {(perWaba?.errors ?? []).filter((e) => e.waba_id === w.id).length}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge value={w.status} />
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge value={w.health} />
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {w.last_synced_at ? new Date(w.last_synced_at).toLocaleString() : "Never"}
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
          {visibleApps.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No subscribed-app inventory is available in this scope yet. Run Business Portfolio
              Sync before release.
            </p>
          )}
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
                      {user.last_synced_at
                        ? new Date(user.last_synced_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleUsers.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No assigned-user rows are available. The audited Meta inventory returned permission
              errors for this edge; check Health after Portfolio Sync instead of assuming zero users.
            </p>
          )}
        </div>
      </Panel>
    </>
  );
}
