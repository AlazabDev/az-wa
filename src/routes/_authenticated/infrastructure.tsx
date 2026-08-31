import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Stethoscope } from "lucide-react";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { StatusBadge } from "@/components/azwa/status-badge";
import { Button } from "@/components/ui/button";
import { useNumbers, usePortfolios, useWabas } from "@/lib/azwa-data";
import { testWhatsappNumber } from "@/lib/meta/meta.functions";
import { syncBusinessPortfolioComplete } from "@/lib/meta/portfolio-sync.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/infrastructure")({
  head: () => ({
    meta: [
      { title: "Business Portfolio & Infrastructure — AzWA" },
      {
        name: "description",
        content:
          "Live Meta infrastructure tree with full Graph API v26 inventory reconciliation and per-number diagnostics.",
      },
    ],
  }),
  component: Infrastructure,
});

type TestResult = { name: string; status: "PASS" | "WARNING" | "FAIL"; detail: string };

function Infrastructure() {
  const { data: portfolios = [] } = usePortfolios();
  const { data: wabas = [] } = useWabas();
  const { data: numbers = [] } = useNumbers();
  const queryClient = useQueryClient();
  const sync = useServerFn(syncBusinessPortfolioComplete);
  const test = useServerFn(testWhatsappNumber);
  const [results, setResults] = useState<Record<string, TestResult[]>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function runSync(portfolioId: string) {
    setBusy(portfolioId);
    try {
      const report = await sync({ data: { portfolioId } });
      if (report.errors.length) toast.error(report.errors[0]);
      else {
        toast.success(
          `Sync: ${report.wabas.discovered} WABAs · ${report.numbers.discovered} numbers · ${report.templates.synced} templates · ${report.flows.synced} flows · ${report.subscriptions.discoveredApps} app links · ${report.assignedUsers.discovered} assigned users`,
        );
      }
      if (report.warnings.length > 0) toast.warning(report.warnings[0]);
      queryClient.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function runTest(numberId: string) {
    setBusy(numberId);
    try {
      const res = await test({ data: { numberId } });
      setResults((prev) => ({ ...prev, [numberId]: res.results as TestResult[] }));
      queryClient.invalidateQueries({ queryKey: ["whatsapp_numbers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Diagnostics failed");
    } finally {
      setBusy(null);
    }
  }

  async function runAll() {
    for (const n of numbers) await runTest(n.id);
  }

  return (
    <>
      <PageHeader
        title="WhatsApp Infrastructure"
        description="Production reconciliation: token validation, WABAs, phone numbers, templates, WhatsApp Flows, WABA app subscriptions, assigned users and AzWA webhook subscription repair. Local history is never deleted."
        actions={
          <Button variant="outline" onClick={runAll} disabled={busy !== null}>
            <Stethoscope className="size-4" /> Test all numbers
          </Button>
        }
      />

      <div className="space-y-6">
        {portfolios.map((p) => {
          const portfolioWabas = wabas.filter((w) => w.business_portfolio_id === p.id);
          return (
            <Panel
              key={p.id}
              title={`${p.name} · ${p.meta_business_id}`}
              actions={
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {p.last_synced_at
                      ? `Last sync ${new Date(p.last_synced_at).toLocaleString()}`
                      : "Never synced"}
                  </span>
                  <Button size="sm" onClick={() => runSync(p.id)} disabled={busy !== null}>
                    <RefreshCw className="size-3.5" />{" "}
                    {busy === p.id ? "Syncing…" : "Sync from Meta"}
                  </Button>
                </div>
              }
            >
              <div className="space-y-4">
                {portfolioWabas.map((w) => {
                  const wabaNumbers = numbers.filter((n) => n.waba_id === w.id);
                  return (
                    <div key={w.id} className="rounded-md border border-border">
                      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-3 py-2">
                        <span className="font-mono text-xs font-semibold">{w.meta_waba_id}</span>
                        <span className="text-xs text-muted-foreground">{w.name}</span>
                        <StatusBadge value={w.status} />
                        <span className="ml-auto text-xs text-muted-foreground">
                          {wabaNumbers.length} number{wabaNumbers.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="divide-y divide-border">
                        {wabaNumbers.map((n) => (
                          <div key={n.id} className="px-3 py-3">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="font-medium">{n.display_phone_number}</span>
                              <span className="font-mono text-xs text-muted-foreground">
                                {n.meta_phone_number_id}
                              </span>
                              <StatusBadge value={n.health} />
                              <Button
                                size="sm"
                                variant="outline"
                                className="ml-auto"
                                disabled={busy !== null}
                                onClick={() => runTest(n.id)}
                              >
                                {busy === n.id ? "Testing…" : "Run diagnostics"}
                              </Button>
                            </div>
                            {results[n.id] && (
                              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                {(results[n.id] ?? []).map((r) => (
                                  <div
                                    key={r.name}
                                    className="rounded-md border border-border bg-muted/30 p-2"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-medium">{r.name}</span>
                                      <StatusBadge value={r.status} />
                                    </div>
                                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                                      {r.detail}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
