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
import { numbersInScope, useScope } from "@/lib/scope";
import { testWhatsappNumber } from "@/lib/meta/meta.functions";

export const Route = createFileRoute("/_authenticated/numbers")({
  head: () => ({
    meta: [
      { title: "WhatsApp Numbers — AzWA" },
      {
        name: "description",
        content:
          "Every current and future WhatsApp phone number with quality rating, messaging limit, webhook state, API health and diagnostics.",
      },
      { property: "og:title", content: "WhatsApp Numbers — AzWA" },
      {
        property: "og:description",
        content: "Operational registry of all WhatsApp phone numbers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NumbersPage,
});

function NumbersPage() {
  const { scope } = useScope();
  const { data: allNumbers = [] } = useNumbers();
  const { data: wabas = [] } = useWabas();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const test = useServerFn(testWhatsappNumber);
  const queryClient = useQueryClient();

  const rows = useMemo(() => {
    const scoped = numbersInScope(allNumbers, scope);
    const needle = q.trim().toLowerCase();
    if (!needle) return scoped;
    return scoped.filter((n) =>
      [
        n.display_phone_number,
        n.meta_phone_number_id,
        n.internal_name,
        n.verified_name,
        n.department,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [allNumbers, scope, q]);

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
        description="Numbers are discovered and imported, never hardcoded. Adding a tenth number requires no code change."
        actions={
          <Input
            placeholder="Search number, ID, internal name…"
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
              {rows.map((n) => (
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
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
