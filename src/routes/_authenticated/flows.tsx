import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GitBranch, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { StatusBadge } from "@/components/azwa/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNumbers, useWabas } from "@/lib/azwa-data";
import {
  deleteDraftFlow,
  deprecateFlow,
  publishFlow,
  syncWhatsappFlows,
} from "@/lib/meta/flows.functions";
import { useWhatsappFlows } from "@/lib/meta/inventory-data";
import { useScope } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/flows")({
  head: () => ({
    meta: [
      { title: "WhatsApp Flows — AzWA" },
      { name: "description", content: "Live WABA-scoped WhatsApp Flows inventory and lifecycle controls." },
    ],
  }),
  component: WhatsappFlowsPage,
});

function WhatsappFlowsPage() {
  const { scope } = useScope();
  const { data: flows = [] } = useWhatsappFlows();
  const { data: wabas = [] } = useWabas();
  const { data: numbers = [] } = useNumbers();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const sync = useServerFn(syncWhatsappFlows);
  const publish = useServerFn(publishFlow);
  const deprecate = useServerFn(deprecateFlow);
  const removeDraft = useServerFn(deleteDraftFlow);

  const visibleWabaIds = useMemo(() => {
    if (scope.kind === "all" || !scope.id) return new Set(wabas.map((w) => w.id));
    if (scope.kind === "business") {
      return new Set(wabas.filter((w) => w.business_portfolio_id === scope.id).map((w) => w.id));
    }
    if (scope.kind === "waba") return new Set([scope.id]);
    const number = numbers.find((item) => item.id === scope.id);
    return new Set(number ? [number.waba_id] : []);
  }, [numbers, scope, wabas]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return flows.filter((flow) => {
      if (!visibleWabaIds.has(flow.waba_id)) return false;
      if (!needle) return true;
      return [flow.name, flow.meta_flow_id, flow.status, ...(flow.categories ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [flows, q, visibleWabaIds]);

  async function refreshAll() {
    setBusy("sync");
    try {
      let synced = 0;
      for (const wabaId of visibleWabaIds) {
        const result = await sync({ data: { wabaId } });
        if (!result.ok) throw new Error(result.error);
        synced += result.synced;
      }
      toast.success(`WhatsApp Flows synced: ${synced}`);
      await queryClient.invalidateQueries({ queryKey: ["whatsapp_flows"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Flow sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function mutate(id: string, action: "publish" | "deprecate" | "delete") {
    setBusy(id);
    try {
      const result =
        action === "publish"
          ? await publish({ data: { flowId: id } })
          : action === "deprecate"
            ? await deprecate({ data: { flowId: id } })
            : await removeDraft({ data: { flowId: id } });
      if (!result.ok) throw new Error(result.error);
      toast.success(`Flow ${action} completed`);
      await queryClient.invalidateQueries({ queryKey: ["whatsapp_flows"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Unable to ${action} flow`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="WhatsApp Flows"
        description="Live Graph API v26 inventory. Flows belong to a WABA; publish/deprecate/delete operations are executed server-side with the resolved WABA credential."
        actions={
          <div className="flex gap-2">
            <Input
              className="w-64"
              placeholder="Search flow, category, ID…"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
            <Button onClick={refreshAll} disabled={busy !== null}>
              <RefreshCw className="size-4" /> {busy === "sync" ? "Syncing…" : "Sync Flows"}
            </Button>
          </div>
        }
      />

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Flow</th>
                <th className="py-2 pr-4 font-medium">Flow ID</th>
                <th className="py-2 pr-4 font-medium">WABA</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Categories</th>
                <th className="py-2 pr-4 font-medium">Validation</th>
                <th className="py-2 pr-4 font-medium">Last Sync</th>
                <th className="py-2 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((flow) => {
                const waba = wabas.find((item) => item.id === flow.waba_id);
                const status = flow.status.toUpperCase();
                return (
                  <tr key={flow.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4">
                      <span className="flex items-center gap-2 font-medium">
                        <GitBranch className="size-4" /> {flow.name}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{flow.meta_flow_id}</td>
                    <td className="py-3 pr-4 text-xs">
                      <div>{waba?.name ?? "Unknown WABA"}</div>
                      <div className="font-mono text-muted-foreground">{waba?.meta_waba_id ?? flow.waba_id}</div>
                    </td>
                    <td className="py-3 pr-4"><StatusBadge value={status} /></td>
                    <td className="py-3 pr-4 text-xs">{flow.categories?.join(", ") || "—"}</td>
                    <td className="py-3 pr-4 text-xs">
                      {(flow.validation_errors?.length ?? 0) === 0 ? "OK" : `${flow.validation_errors.length} issue(s)`}
                    </td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">
                      {flow.last_synced_at ? new Date(flow.last_synced_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex gap-2">
                        {status === "DRAFT" && (
                          <>
                            <Button size="sm" disabled={busy !== null} onClick={() => mutate(flow.id, "publish")}>Publish</Button>
                            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => mutate(flow.id, "delete")}>Delete</Button>
                          </>
                        )}
                        {status === "PUBLISHED" && (
                          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => mutate(flow.id, "deprecate")}>Deprecate</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No flows in the current scope.</p>}
        </div>
      </Panel>
    </>
  );
}
