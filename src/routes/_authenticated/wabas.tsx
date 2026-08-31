import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { StatusBadge } from "@/components/azwa/status-badge";
import { useNumbers, usePortfolios, useWabas } from "@/lib/azwa-data";
import {
  useWabaAssignedUsers,
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
        content: "Every WhatsApp Business Account with numbers, templates, Flows, subscribed apps, assigned users and operational health.",
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

  return (
    <>
      <PageHeader
        title="WhatsApp Business Accounts"
        description="Live WABA inventory from Meta Graph API v26. Missing assets are retained and marked instead of deleted."
      />
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                <th className="py-2 pr-4 font-medium">WABA ID</th>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Business</th>
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
                const wabaNumberIds = new Set(numbers.filter((n) => n.waba_id === w.id).map((n) => n.id));
                const wabaApps = subscribedApps.filter((app) => app.waba_id === w.id && app.status === "active");
                const messageCount = (perWaba?.messages ?? []).filter(
                  (message) => message.whatsapp_number_id !== null && wabaNumberIds.has(message.whatsapp_number_id),
                ).length;
                return (
                  <tr key={w.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">{w.meta_waba_id}</td>
                    <td className="py-2 pr-4">{w.name ?? "—"}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{portfolio?.meta_business_id ?? "—"}</td>
                    <td className="py-2 pr-4 tabular-nums">{wabaNumberIds.size}</td>
                    <td className="py-2 pr-4 tabular-nums">{(perWaba?.templates ?? []).filter((t) => t.waba_id === w.id).length}</td>
                    <td className="py-2 pr-4 tabular-nums">{flows.filter((flow) => flow.waba_id === w.id && flow.status !== "MISSING_FROM_META").length}</td>
                    <td className="py-2 pr-4 tabular-nums">{wabaApps.length}</td>
                    <td className="py-2 pr-4"><StatusBadge value={wabaApps.some((app) => app.is_azwa) ? "healthy" : "critical"} /></td>
                    <td className="py-2 pr-4 tabular-nums">{assignedUsers.filter((user) => user.waba_id === w.id && user.status === "active").length}</td>
                    <td className="py-2 pr-4 tabular-nums">{messageCount}</td>
                    <td className="py-2 pr-4 tabular-nums">{(perWaba?.errors ?? []).filter((e) => e.waba_id === w.id).length}</td>
                    <td className="py-2 pr-4"><StatusBadge value={w.status} /></td>
                    <td className="py-2 pr-4"><StatusBadge value={w.health} /></td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{w.last_synced_at ? new Date(w.last_synced_at).toLocaleString() : "Never"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
