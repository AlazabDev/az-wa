import { BookOpen, ExternalLink } from "lucide-react";

import { Panel } from "@/components/azwa/page-header";

export const META_DOCUMENTATION = [
  { title: "البدء باستخدام Cloud API", url: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started", description: "إعداد الرقم واعتماد التطبيق والرسائل" },
  { title: "إرسال الرسائل", url: "https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages", description: "واجهة الإرسال وقيود الرسائل" },
  { title: "قوالب الرسائل", url: "https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates", description: "الإنشاء والاعتماد وإدارة القوالب" },
  { title: "Webhooks", url: "https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks", description: "الإشعارات والتحقق من التوقيع" },
  { title: "مرجع Cloud API", url: "https://developers.facebook.com/docs/whatsapp/cloud-api/reference", description: "حقول الطلبات والاستجابات الرسمية" },
  { title: "WhatsApp Flows", url: "https://developers.facebook.com/docs/whatsapp/flows", description: "تدفقات التفاعل داخل واتساب" },
] as const;

export function MetaDocumentation() {
  return (
    <Panel title="توثيق Meta الرسمي">
      <p className="mb-4 text-sm text-muted-foreground">
        روابط مرجعية إلى وثائق Meta الرسمية؛ لا تعكس حالة الاتصال أو صلاحيات التطبيق الفعلية.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {META_DOCUMENTATION.map((item) => (
          <a
            key={item.url}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-lg border border-border p-4 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <div className="mb-3 flex items-center justify-between">
              <BookOpen aria-hidden="true" className="size-5 text-primary" />
              <ExternalLink aria-hidden="true" className="size-4 text-muted-foreground group-hover:text-primary" />
            </div>
            <h3 className="text-sm font-semibold">{item.title}</h3>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">{item.description}</p>
          </a>
        ))}
      </div>
    </Panel>
  );
}
