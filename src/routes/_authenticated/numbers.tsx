import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { StatusBadge } from "@/components/azwa/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNumbers, useWabas } from "@/lib/azwa-data";
import { useNumberInventoryExtras } from "@/lib/meta/inventory-data";
import { numbersInScope, useScope } from "@/lib/scope";
import { testWhatsappNumber } from "@/lib/meta/meta.functions";

export const Route = createFileRoute("/_authenticated/numbers")({
  head: () => ({
    meta: [
      { title: "WhatsApp Numbers — AzWA" },
      {
        name: "description",
        content:
          "Every WhatsApp phone number with account mode, platform, throughput, verification, quality, messaging limit, webhook state and API diagnostics.",
      },
    ],
  }),
  component: NumbersPage,
});

function NumbersPage() {
  const { scope } = useScope();
  const { data: allNumbers = [] } = useNumbers();
  const { data: inventoryExtras = {} } = useNumberInventoryExtras();
  const { data: wabas = [] } = useWabas();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const test = useServerFn(testWhatsappNumber);
  const queryClient = useQueryClient();

  const rows = useMemo(() => {
    const scoped = numbersInScope(allNumbers, scope);
    const needle = q.trim().toLowerCase();
    if (!needle) return scoped;
    return scoped.filter((n) => {
      const extra = inventoryExtras[n.id];
      return [
        n.display_phone_number,
        n.meta_phone_number_id,
        n.internal_name,
        n.verified_name,
        n.department,
        extra?.account_mode,
        extra?.platform_type,
        extra?.throughput_level,
        extra?.code_verification_status,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [allNumbers, inventoryExtras, scope, q]);

  async function runTest(id: string) {
    setBusy(id);
    try {
      const res = await test({ data: { numberId: id } });
      const failed = res.results.filter((r) => r.status === "FAIL").length;
      if (failed) toast.error(`${failed} check(s) failed — see Infrastructure for details`);
      else toast.success("All checks passed");
      queryClient.invalidateQueries({ queryKey: ["whatsapp_numbers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="WhatsApp Numbers"
        description="Numbers are discovered and imported from Meta. Missing or disconnected numbers are retained and surfaced instead of silently removed."
        actions={
          <Input
            placeholder="Search number, ID, name, mode, platform…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-72"
          />
        }
      />
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Number</th>
                <th className="py-2 pr-4 font-medium">Internal Name</th>
                <th className="py-2 pr-4 font-medium">Verified Name</th>
                <th className="py-2 pr-4 font-medium">Phone Number ID</th>
                <th className="py-2 pr-4 font-medium">WABA ID</th>
                <th className="py-2 pr-4 font-medium">Mode</th>
                <th className="py-2 pr-4 font-medium">Platform</th>
                <th className="py-2 pr-4 font-medium">Throughput</th>
                <th className="py-2 pr-4 font-medium">Code</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Quality</th>
                <th className="py-2 pr-4 font-medium">Limit</th>
                <th className="py-2 pr-4 font-medium">Webhook</th>
                <th className="py-2 pr-4 font-medium">API</th>
                <th className="py-2 pr-4 font-medium">Last In</th>
                <th className="py-2 pr-4 font-medium">Last Out</th>
                <th className="py-2 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => {
                const extra = inventoryExtras[n.id];
                return (
                  <tr key={n.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 font-medium">{n.display_phone_number}</td>
                    <td className="py-2 pr-4 text-xs">{n.internal_name ?? "—"}</td>
                    <td className="py-2 pr-4 text-xs">{n.verified_name ?? "—"}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                      {n.meta_phone_number_id}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                      {wabas.find((w) => w.id === n.waba_id)?.meta_waba_id ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-xs">{extra?.account_mode ?? "—"}</td>
                    <td className="py-2 pr-4 text-xs">{extra?.platform_type ?? "—"}</td>
                    <td className="py-2 pr-4 text-xs">{extra?.throughput_level ?? "—"}</td>
                    <td className="py-2 pr-4 text-xs">{extra?.code_verification_status ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge value={n.status} />
                    </td>
                    <td className="py-2 pr-4 text-xs">{n.quality_rating ?? "—"}</td>
                    <td className="py-2 pr-4 text-xs">{n.messaging_limit ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge value={n.webhook_status} />
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge value={n.api_health} />
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {n.last_incoming_at ? new Date(n.last_incoming_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {n.last_outgoing_at ? new Date(n.last_outgoing_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => runTest(n.id)}
                      >
                        {busy === n.id ? "Testing…" : "Test API"}
                      </Button>
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
