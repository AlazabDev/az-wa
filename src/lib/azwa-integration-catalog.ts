/**
 * UI-only integration directory. Does not contain secret values or claim live connectivity.
 * Paths point to existing AzWA operational routes, not legacy az-edu APIs.
 */
export type IntegrationRoute =
  | "/credentials" | "/meta-app" | "/numbers" | "/wabas"
  | "/webhooks" | "/media" | "/files" | "/health"
  | "/api-logs" | "/automation" | "/settings" | "/infrastructure";

export type IntegrationDirectoryItem = {
  id: "meta" | "storage" | "automation" | "mcp";
  title: string;
  description: string;
  requiredEnvironmentNames: readonly string[];
  actions: readonly { label: string; to: IntegrationRoute }[];
  availability: "built-in" | "configuration-only";
};

export const INTEGRATION_DIRECTORY: readonly IntegrationDirectoryItem[] = [
  {
    id: "meta",
    title: "Meta WhatsApp Cloud API",
    description: "إدارة تطبيق Meta وأرقام واتساب والاشتراكات والـWebhooks عبر وظائف AzWA الموجودة.",
    requiredEnvironmentNames: ["META_APP_SECRET", "META_SYSTEM_USER_TOKEN", "META_WEBHOOK_VERIFY_TOKEN"],
    actions: [
      { label: "تطبيق Meta", to: "/meta-app" },
      { label: "الأرقام", to: "/numbers" },
      { label: "خطافات الويب", to: "/webhooks" },
      { label: "الفحص الصحي", to: "/health" },
    ],
    availability: "built-in",
  },
  {
    id: "storage",
    title: "MinIO / S3",
    description: "تهيئة الأرشفة وفحص اتصال MinIO من صفحة Webhooks، واستعراض الوسائط من قسم الوسائط.",
    requiredEnvironmentNames: ["MINIO_ENDPOINT", "MINIO_BUCKET", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY"],
    actions: [
      { label: "اختبار التخزين", to: "/webhooks" },
      { label: "الوسائط", to: "/media" },
      { label: "الملفات", to: "/files" },
    ],
    availability: "built-in",
  },
  {
    id: "automation",
    title: "قوائم الانتظار والأتمتة",
    description: "إدارة الأتمتة من وحدات AzWA الحالية. لا تُدار مفاتيح خدمات أخرى من المتصفح.",
    requiredEnvironmentNames: [],
    actions: [
      { label: "الأتمتة", to: "/automation" },
      { label: "سجل API", to: "/api-logs" },
    ],
    availability: "built-in",
  },
  {
    id: "mcp",
    title: "خدمات MCP الخارجية",
    description: "أسماء متغيرات التكامل مرجع للإعداد فقط؛ لم يُتحقق من وجود اتصال حي لخدمات Daftra أو magicplan أو UberFix.",
    requiredEnvironmentNames: ["MCP_ACCESS_KEY", "DAFTRA_API_KEY", "MAGICPLAN_API_KEY", "UBERFIX_API_KEY"],
    actions: [
      { label: "إعدادات المنصة", to: "/settings" },
      { label: "التشخيص", to: "/health" },
    ],
    availability: "configuration-only",
  },
];

export type HelpEntry = { question: string; answer: string; route: IntegrationRoute; linkLabel: string };
export const AZWA_HELP_ENTRIES: readonly HelpEntry[] = [
  { question: "كيف أربط رقم واتساب جديدًا؟", answer: "افتح أرقام الهواتف واستخدم تسجيل Meta المضمّن. ثم تحقق من حالة الرقم في الفحص الصحي.", route: "/numbers", linkLabel: "أرقام الهواتف" },
  { question: "أين أفحص وصول Webhook؟", answer: "صفحة خطافات الويب تعرض الإعداد والتشخيص وسجل حركة الطلبات بحسب الصلاحيات.", route: "/webhooks", linkLabel: "خطافات الويب" },
  { question: "أين أحفظ مفتاح Meta أو MinIO؟", answer: "تُحفظ القيم السرية على الخادم. هذه الواجهة تعرض أسماء المتغيرات وسجلات الاعتمادات المصرّح بها، ولا تكشف قيم التوكنات.", route: "/credentials", linkLabel: "مفاتيح الربط" },
  { question: "كيف أختبر الاتصال بالتخزين؟", answer: "توجد عملية فحص اتصال MinIO على صفحة خطافات الويب؛ ظهور اسم المتغير لا يثبت سلامة الاتصال.", route: "/webhooks", linkLabel: "اختبار MinIO" },
  { question: "كيف أتحقق من جاهزية الإنتاج؟", answer: "افتح الصحة والتشخيص واطلع على نتائج الاختبارات الفعلية. النتيجة لا تغني عن اختبارات النشر والتكامل.", route: "/health", linkLabel: "الصحة والتشخيص" },
  { question: "أين سجلات واجهات API؟", answer: "يمكن مراجعة العمليات وأخطاء استدعاءات API من سجل واجهات API وفق الصلاحيات.", route: "/api-logs", linkLabel: "سجل API" },
];

export function searchAzwaHelp(query: string): readonly HelpEntry[] {
  const normalized = query.trim().toLocaleLowerCase();
  return normalized
    ? AZWA_HELP_ENTRIES.filter(({ question, answer, linkLabel }) =>
        [question, answer, linkLabel].some((field) => field.toLocaleLowerCase().includes(normalized)),
      )
    : AZWA_HELP_ENTRIES;
}
