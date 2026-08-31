import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";
import { Button } from "@/components/ui/button";
import { getMetaProductionReadiness } from "@/lib/meta/production-readiness.functions";

export const Route = createFileRoute("/_authenticated/health")({
  head: () => ({
    meta: [
      { title: "Health & Diagnostics — AzWA" },
      {
        name: "description",
        content:
          "Continuous health checks per number and WABA: API reachability, webhook delivery, token validity, quality rating and messaging limits.",
      },
      { property: "og:title", content: "Health & Diagnostics — AzWA" },
      { property: "og:description", content: "Continuous health checks for WhatsApp infrastructure." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HealthPage,
});

type ReadinessResult = Awaited<ReturnType<typeof getMetaProductionReadiness>>;

function ProductionReadiness() {
  const load = useServerFn(getMetaProductionReadiness);
  const [result, setResult] = useState<ReadinessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setResult(await load({ data: {} }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to run production readiness check");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // refresh is intentionally run once on route mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Meta production readiness</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Live database state compared with the audited Graph v26 inventory snapshot. Discovery remains the runtime source of truth.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Recheck
        </Button>
      </div>

      {error ? <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

      {result ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Readiness" value={result.ready ? "READY" : "BLOCKED"} />
            <Metric label="Score" value={`${result.score}%`} />
            <Metric label="WABAs" value={String(result.totals.wabas)} />
            <Metric label="Numbers" value={String(result.totals.numbers)} />
            <Metric label="Templates" value={String(result.totals.templates)} />
            <Metric label="Flows" value={String(result.totals.flows)} />
          </div>

          <div className="mt-5 grid gap-2">
            {result.checks.map((check) => (
              <div key={check.key} className="flex items-start gap-3 rounded-md border border-border px-3 py-2.5">
                {check.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <CircleAlert className={`mt-0.5 size-4 shrink-0 ${check.severity === "critical" ? "text-destructive" : "text-warning"}`} />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium">{check.label}</div>
                  <div className="text-xs text-muted-foreground">{check.detail}</div>
                </div>
              </div>
            ))}
          </div>

          {(result.drift.staleWabas.length || result.drift.staleNumbers.length || result.drift.missingBaselinePhones.length || result.drift.extraPhones.length) ? (
            <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Drift — stale WABAs: {result.drift.staleWabas.length}; stale numbers: {result.drift.staleNumbers.length}; missing audited numbers: {result.drift.missingBaselinePhones.length}; newly discovered numbers: {result.drift.extraPhones.length}.
            </div>
          ) : null}
        </>
      ) : loading ? <p className="mt-4 text-sm text-muted-foreground">Running production readiness checks…</p> : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function HealthPage() {
  return (
    <>
      <PageHeader
        title="Health & Diagnostics"
        description="Every diagnostic run is persisted so degradation can be traced over time rather than guessed at."
      />
      <div className="space-y-6">
        <ProductionReadiness />
        <RecordTable
          title="Health check history"
          table="health_checks"
          orderBy="checked_at"
          columns={[
            { key: "checked_at", label: "Checked", kind: "date" },
            { key: "scope", label: "Scope" },
            { key: "check_name", label: "Check" },
            { key: "status", label: "Result", kind: "status" },
            { key: "latency_ms", label: "Latency (ms)" },
            { key: "detail", label: "Detail" },
          ]}
        />
        <RecordTable
          title="Open API errors"
          table="api_errors"
          columns={[
            { key: "created_at", label: "When", kind: "date" },
            { key: "error_code", label: "Code", kind: "mono" },
            { key: "error_type", label: "Type" },
            { key: "message", label: "Message" },
            { key: "occurrences", label: "Count" },
            { key: "status", label: "Status", kind: "status" },
          ]}
          emptyLabel="No API errors recorded."
        />
        <RecordTable
          title="Alerts"
          table="alerts"
          columns={[
            { key: "created_at", label: "Raised", kind: "date" },
            { key: "severity", label: "Severity", kind: "status" },
            { key: "alert_type", label: "Type" },
            { key: "title", label: "Title" },
            { key: "status", label: "Status", kind: "status" },
          ]}
          emptyLabel="No alerts raised."
        />
      </div>
    </>
  );
}
