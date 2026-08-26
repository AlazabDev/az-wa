import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Stethoscope } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { StatusBadge } from "@/components/azwa/status-badge";
import { Button } from "@/components/ui/button";
import { useNumbers, usePortfolios, useWabas } from "@/lib/azwa-data";
import { syncBusinessPortfolio, testWhatsappNumber } from "@/lib/meta/meta.functions";

export const Route = createFileRoute("/_authenticated/infrastructure")({
  head: () => ({
    meta: [
      { title: "Business Portfolio & Infrastructure — AzWA" },
      {
        name: "description",
        content:
          "Live Meta infrastructure tree: business portfolios, WABAs and WhatsApp phone numbers with per-number connectivity diagnostics.",
      },
      { property: "og:title", content: "Business Portfolio & Infrastructure — AzWA" },
      {
        property: "og:description",
        content: "Portfolio → WABA → phone number tree with connectivity diagnostics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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

  const sync = useServerFn(syncBusinessPortfolio);
  const test = useServerFn(testWhatsappNumber);

  const [results, setResults] = useState<Record<string, TestResult[]>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function runSync(portfolioId: string) {
    setBusy(portfolioId);
    try {
      const report = await sync({ data: { portfolioId } });
      if (report.status === "queued") {
        toast.success(`Meta sync queued${report.job_id ? ` · job ${report.job_id}` : ""}`);
      } else {
        toast.success("Meta sync accepted");
      }
      window.setTimeout(() => queryClient.invalidateQueries(), 1500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sync failed");
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Diagnostics failed");
    } finally {
      setBusy(null);
    }
  }

  async function runAll() {
    for (const number of numbers) await runTest(number.id);
  }

  return (
    <>
      <PageHeader
        title="WhatsApp Infrastructure"
        description="Live tree of business portfolios, WABAs and phone numbers as stored in the operational database. Sync reconciles it with Meta without deleting local history."
        actions={
          <Button variant="outline" onClick={runAll} disabled={busy !== null}>
            <Stethoscope className="size-4" /> Test all numbers
          </Button>
        }
      />

      <div className="space-y-6">
        {portfolios.map((portfolio) => {
          const portfolioWabas = wabas.filter(
            (waba) => waba.business_portfolio_id === portfolio.id,
          );
          return (
            <Panel
              key={portfolio.id}
              title={`${portfolio.name ?? "Business Portfolio"} · ${portfolio.meta_business_id}`}
              actions={
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {portfolio.last_synced_at
                      ? `Last sync ${new Date(portfolio.last_synced_at).toLocaleString()}`
                      : "Never synced"}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => runSync(portfolio.id)}
                    disabled={busy !== null}
                  >
                    <RefreshCw className="size-3.5" /> Sync from Meta
                  </Button>
                </div>
              }
            >
              <div className="space-y-4">
                {portfolioWabas.map((waba) => {
                  const wabaNumbers = numbers.filter((number) => number.waba_id === waba.id);
                  return (
                    <div key={waba.id} className="rounded-md border border-border">
                      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-3 py-2">
                        <span className="font-mono text-xs font-semibold">{waba.meta_waba_id}</span>
                        <span className="text-xs text-muted-foreground">{waba.name}</span>
                        <StatusBadge value={waba.status} />
                        <span className="ml-auto text-xs text-muted-foreground">
                          {wabaNumbers.length} number{wabaNumbers.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="divide-y divide-border">
                        {wabaNumbers.map((number) => (
                          <div key={number.id} className="px-3 py-3">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="font-medium">
                                {number.display_phone_number ?? "Unassigned"}
                              </span>
                              <span className="font-mono text-xs text-muted-foreground">
                                {number.meta_phone_number_id}
                              </span>
                              <StatusBadge value={number.health} />
                              <Button
                                size="sm"
                                variant="outline"
                                className="ml-auto"
                                disabled={busy !== null}
                                onClick={() => runTest(number.id)}
                              >
                                {busy === number.id ? "Testing…" : "Run diagnostics"}
                              </Button>
                            </div>
                            {results[number.id] && (
                              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                {(results[number.id] ?? []).map((result) => (
                                  <div
                                    key={result.name}
                                    className="rounded-md border border-border bg-muted/30 p-2"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-medium">{result.name}</span>
                                      <StatusBadge value={result.status} />
                                    </div>
                                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                                      {result.detail}
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
