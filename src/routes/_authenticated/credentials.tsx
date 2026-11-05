import { createFileRoute } from "@tanstack/react-router";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";
import { IntegrationDirectory } from "@/components/azwa/integration-directory";

export const Route = createFileRoute("/_authenticated/credentials")({
  head: () => ({
    meta: [
      { title: "Credentials — AzWA" },
      {
        name: "description",
        content:
          "Access-token registry per business portfolio, WABA or phone number, with scope, expiry and validation state. Token values never reach the browser.",
      },
      { property: "og:title", content: "Credentials — AzWA" },
      { property: "og:description", content: "Hierarchical Meta credential registry." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CredentialsPage,
});

function CredentialsPage() {
  return (
    <>
      <PageHeader
        title="مفاتيح الربط والتكاملات"
        description="دليل تكاملات فعلي مرتبط بشاشات التشغيل الحالية، وسجل اعتمادات Meta المقروء من الخادم دون إظهار قيم التوكنات."
      />
      <IntegrationDirectory />
      <div className="mt-6" />
      <Panel title="ترتيب أولوية اعتماد Meta">
        <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
          <li>اعتماد مرتبط برقم هاتف محدد</li>
          <li>اعتماد مرتبط بحساب واتساب للأعمال</li>
          <li>اعتماد مرتبط بالمحفظة التجارية</li>
          <li>متغير الخادم META_SYSTEM_USER_TOKEN عند عدم وجود اعتماد أضيق نطاقًا</li>
        </ol>
      </Panel>
      <div className="mt-6">
        <RecordTable
          title="سجل اعتمادات Meta الفعلي"
          table="meta_credentials"
          columns={[
            { key: "created_at", label: "أُضيف", kind: "date" },
            { key: "label", label: "الاسم" },
            { key: "scope", label: "النطاق" },
            { key: "token_type", label: "النوع" },
            { key: "status", label: "الحالة", kind: "status" },
            { key: "expires_at", label: "الانتهاء", kind: "date" },
            { key: "last_validated_at", label: "آخر تحقق", kind: "date" },
          ]}
          emptyLabel="لا توجد سجلات اعتمادات ظاهرة. لا يمكن استنتاج حالة توكن الخادم من غياب السجلات."
        />
      </div>
    </>
  );
}
