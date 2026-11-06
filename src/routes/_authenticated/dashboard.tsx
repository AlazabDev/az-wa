import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { StatusBadge } from "@/components/azwa/status-badge";
import { useNumbers, usePortfolios, useWabas, useOpsCounters } from "@/lib/azwa-data";
import { numbersInScope, useScope } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Operations Overview — AzWA" },
      {
        name: "description",
        content:
          "Aggregated WhatsApp operations overview across every business portfolio, WABA and phone number.",
      },
      { property: "og:title", content: "Operations Overview — AzWA" },
      { property: "og:description", content: "Aggregated multi-WABA WhatsApp operations metrics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <div className={`mt-3 text-2xl font-bold tabular-nums ${tone ?? "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function Dashboard() {
  const { scope } = useScope();
  const { data: portfolios = [] } = usePortfolios();
  const { data: wabas = [] } = useWabas();
  const { data: allNumbers = [], isLoading } = useNumbers();

  const numbers = useMemo(() => numbersInScope(allNumbers, scope), [allNumbers, scope]);
  const { data: counters } = useOpsCounters(numbers.map((n) => n.id), scope.kind !== "all");

  const scopedWabas =
    scope.kind === "all"
      ? wabas
      : wabas.filter((w) => numbers.some((n) => n.waba_id === w.id) || w.id === scope.id);

  const healthy = numbers.filter((n) => n.health === "healthy").length;
  const warning = numbers.filter((n) => n.health === "warning").length;
  const critical = numbers.filter((n) => n.health === "critical").length;
  const unknown = numbers.filter((n) => n.health === "unknown").length;

  return (
    <>
      <PageHeader
        title="نظرة عامة على العمليات"
        description={`النطاق: ${scope.label}. تعرض المؤشرات بيانات الأرقام الموجودة في النطاق المحدد.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Metric label="المحافظ التجارية" value={scope.kind === "all" ? portfolios.length : 1} />
        <Metric label="حسابات واتساب" value={scopedWabas.length} />
        <Metric label="أرقام واتساب" value={isLoading ? "…" : numbers.length} />
        <Metric label="سليمة" value={healthy} tone="text-success" />
        <Metric label="تحذيرات" value={warning} tone="text-warning-foreground" />
        <Metric label="حرجة / غير معروفة" value={critical + unknown} tone="text-destructive" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Metric label="الرسائل (24 ساعة)" value={counters?.messagesToday ?? 0} />
        <Metric label="الواردة" value={counters?.incoming ?? 0} />
        <Metric label="الصادرة" value={counters?.outgoing ?? 0} />
        <Metric label="المرسلة" value={counters?.sent ?? 0} />
        <Metric label="المسلّمة" value={counters?.delivered ?? 0} />
        <Metric label="المقروءة" value={counters?.read ?? 0} />
        <Metric label="الفاشلة" value={counters?.failed ?? 0} tone="text-destructive" />
        <Metric label="المحادثات المفتوحة" value={counters?.openConversations ?? 0} />
        <Metric label="جهات الاتصال" value={counters?.contacts ?? 0} />
        <Metric label="الوسائط المستلمة" value={counters?.mediaReceived ?? 0} />
        <Metric label="القوالب" value={counters?.templates ?? 0} />
        <Metric label="القوالب المعتمدة" value={counters?.approvedTemplates ?? 0} />
        <Metric label="القوالب المرفوضة" value={counters?.rejectedTemplates ?? 0} />
        <Metric label="الحملات النشطة" value={counters?.runningCampaigns ?? 0} />
        <Metric
          label="أخطاء Webhook"
          value={counters?.webhookErrors ?? 0}
          tone="text-destructive"
        />
        <Metric label="أخطاء API" value={counters?.apiErrors ?? 0} tone="text-destructive" />
        <Metric label="الرسائل في الانتظار" value={counters?.queueBacklog ?? 0} />
      </div>

      <div className="mt-6">
        <Panel title="الأرقام ضمن النطاق">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs text-muted-foreground">
                  <th className="py-3 px-3 font-medium">الرقم</th>
                  <th className="py-3 px-3 font-medium">معرّف رقم الهاتف</th>
                  <th className="py-3 px-3 font-medium">WABA</th>
                  <th className="py-3 px-3 font-medium">الحالة</th>
                  <th className="py-3 px-3 font-medium">API</th>
                  <th className="py-3 px-3 font-medium">الصحة</th>
                </tr>
              </thead>
              <tbody>
                {numbers.map((n) => {
                  const waba = wabas.find((w) => w.id === n.waba_id);
                  return (
                    <tr key={n.id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 px-3 font-medium">{n.display_phone_number}</td>
                      <td className="py-3 px-3 font-mono text-xs text-muted-foreground">
                        {n.meta_phone_number_id}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-muted-foreground">
                        {waba?.meta_waba_id ?? "—"}
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge value={n.status} />
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge value={n.api_health} />
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge value={n.health} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
