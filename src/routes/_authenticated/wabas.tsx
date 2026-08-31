import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { StatusBadge } from "@/components/azwa/status-badge";
import { useNumbers, usePortfolios, useWabas } from "@/lib/azwa-data";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/wabas")({
  head: () => ({
    meta: [
      { title: "WABAs — AzWA" },
      {
        name: "description",
        content:
          "Every WhatsApp Business Account in the organisation with its numbers, templates, message volume, errors and sync state.",
      },
      { property: "og:title", content: "WABAs — AzWA" },
      {
        property: "og:description",
        content: "All WhatsApp Business Accounts in one control plane.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WabasPage,
});

function WabasPage() {
  const { scope } = useScope();
  const { data: wabas = [] } = useWabas();
  const { data: numbers = [] } = useNumbers();
  const { data: portfolios = [] } = usePortfolios();

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
        description="A WABA owns many phone numbers and its own template library. Everything below is scoped by the selector in the top bar."
      />
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                <th className="py-2 pr-4 font-medium">WABA ID</th>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Business Portfolio</th>
                <th className="py-2 pr-4 font-medium">Numbers</th>
                <th className="py-2 pr-4 font-medium">Templates</th>
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
                const wabaNumberIds = new Set(
                  numbers.filter((n) => n.waba_id === w.id).map((n) => n.id),
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
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {portfolio?.meta_business_id ?? "—"}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{wabaNumberIds.size}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      {(perWaba?.templates ?? []).filter((t) => t.waba_id === w.id).length}
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
    </>
  );
}
