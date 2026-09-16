import { useState } from "react";
import { Search, RotateCw } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";
import { Input } from "@/components/ui/input";

import { META_WEBHOOK_CALLBACK_URL, META_WEBHOOK_INTERNAL_PATH } from "@/lib/meta/public-config";

export const Route = createFileRoute("/_authenticated/webhooks")({
  head: () => ({
    meta: [
      { title: "Webhooks — AzWA" },
      {
        name: "description",
        content:
          "Meta webhook request monitor with verification status, event type, request time and delivery status.",
      },
      { property: "og:title", content: "Webhooks — AzWA" },
      { property: "og:description", content: "Monitor every Meta webhook request and verification result." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WebhooksPage,
});

function WebhooksPage() {
  const [search, setSearch] = useState("");
  const [verification, setVerification] = useState("");
  const [status, setStatus] = useState("");
  const [eventType, setEventType] = useState("");

  return (
    <div dir="rtl">
      <PageHeader
        title="مراقبة Webhook Meta"
        description="سجل تفاعلي لكل طلب يصل من Meta، مع نوع الحدث ووقت الوصول ونتيجة التحقق من Verify Token أو X-Hub-Signature-256."
      />

      <Panel title="نقطة الاستقبال والتحقق">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">Callback URL</dt>
            <dd className="mt-1 font-mono text-xs break-all" dir="ltr">
              {META_WEBHOOK_CALLBACK_URL}
              <span className="mt-1 block font-sans text-[11px] text-muted-foreground" dir="rtl">
                يتم توجيهه داخليًا إلى {META_WEBHOOK_INTERNAL_PATH}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">Verify Token</dt>
            <dd className="mt-1 text-xs text-muted-foreground">
              يتم التحقق منه على الخادم ولا يتم تخزين الرمز نفسه في سجل الطلبات.
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">Signature</dt>
            <dd className="mt-1 text-xs text-muted-foreground">
              يتم فحص X-Hub-Signature-256 باستخدام Meta App Secret قبل معالجة الطلب.
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">التحديث</dt>
            <dd className="mt-1 text-xs text-muted-foreground">
              الجدول يتحدث تلقائيًا كل 30 ثانية، ويمكن استخدام الفلاتر لعرض الطلبات المطلوبة فقط.
            </dd>
          </div>
        </dl>
      </Panel>

      <div className="mt-6 space-y-6">
        <Panel title="طلبات Meta الواردة">
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_150px_190px]">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="بحث بالـ WABA أو Phone Number ID أو Request ID..."
                className="pr-9"
              />
            </div>

            <select
              value={verification}
              onChange={(event) => setVerification(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="نوع التحقق"
            >
              <option value="">كل أنواع التحقق</option>
              <option value="verify_token">Verify Token</option>
              <option value="signature">X-Hub-Signature-256</option>
            </select>

            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="حالة HTTP"
            >
              <option value="">كل الحالات</option>
              <option value="200">200 — مقبول</option>
              <option value="400">400 — طلب غير صالح</option>
              <option value="401">401 — غير مصرح</option>
              <option value="403">403 — مرفوض</option>
            </select>

            <select
              value={eventType}
              onChange={(event) => setEventType(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="نوع الحدث"
            >
              <option value="">كل الأحداث</option>
              <option value="messages">messages</option>
              <option value="account_update">account_update</option>
              <option value="message_template_status_update">message_template_status_update</option>
              <option value="message_template_quality_update">message_template_quality_update</option>
              <option value="template_category_update">template_category_update</option>
              <option value="phone_number_quality_update">phone_number_quality_update</option>
              <option value="message_echoes">message_echoes</option>
            </select>
          </div>

          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <RotateCw className="h-3.5 w-3.5" />
            يتم الاحتفاظ ببيانات التحقق الوصفية فقط؛ لا يتم عرض Verify Token أو App Secret.
          </div>

          <RecordTable
            title=""
            table="meta_webhook_request_audit"
            orderBy="received_at"
            limit={500}
            searchText={search}
            searchKeys={["meta_waba_id", "meta_phone_number_id", "request_id", "event_type"]}
            filters={{
              verification_type: verification || undefined,
              http_status: status || undefined,
              event_type: eventType || undefined,
            }}
            columns={[
              { key: "received_at", label: "وقت الطلب", kind: "date" },
              { key: "method", label: "Method", kind: "status" },
              { key: "event_type", label: "نوع الحدث" },
              { key: "verification_type", label: "طريقة التحقق" },
              { key: "verification_valid", label: "التحقق", kind: "bool" },
              { key: "http_status", label: "HTTP" },
              { key: "meta_phone_number_id", label: "Phone Number ID", kind: "mono" },
              { key: "meta_waba_id", label: "WABA ID", kind: "mono" },
              { key: "request_id", label: "Request ID", kind: "mono" },
            ]}
            emptyLabel="لا توجد طلبات Meta مطابقة للفلاتر الحالية."
          />
        </Panel>

        <RecordTable
          title="أحداث الويب هوك المعالجة"
          table="webhook_events"
          orderBy="received_at"
          columns={[
            { key: "received_at", label: "وقت الاستلام", kind: "date" },
            { key: "event_type", label: "النوع" },
            { key: "field", label: "Field" },
            { key: "meta_phone_number_id", label: "Phone Number ID", kind: "mono" },
            { key: "meta_waba_id", label: "WABA ID", kind: "mono" },
            { key: "signature_valid", label: "التوقيع", kind: "bool" },
            { key: "status", label: "الحالة", kind: "status" },
            { key: "error_message", label: "الخطأ" },
          ]}
        />

        <RecordTable
          title="أحداث الأرقام غير المعروفة"
          table="unmapped_number_events"
          orderBy="received_at"
          emptyLabel="لا توجد أحداث لأرقام غير معروفة."
          columns={[
            { key: "received_at", label: "وقت الاستلام", kind: "date" },
            { key: "meta_phone_number_id", label: "Phone Number ID", kind: "mono" },
            { key: "display_phone_number", label: "الرقم" },
            { key: "meta_waba_id", label: "WABA ID", kind: "mono" },
            { key: "resolved", label: "تم الحل", kind: "bool" },
          ]}
        />
      </div>
    </div>
  );
}
