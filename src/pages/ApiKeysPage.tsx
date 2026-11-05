import { useState } from "react";
import { KeyRound, ShieldCheck, Copy, Check, ExternalLink, Globe, HardDrive, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/WorkspaceUI";
import { toast } from "sonner";

export default function ApiKeysPage() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    toast.success("تم النسخ إلى الحافظة");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const integrations = [
    {
      title: "Meta WhatsApp Cloud API",
      icon: Globe,
      color: "text-emerald-500",
      description: "المفاتيح المطلوبة لاستقبال وإرسال رسائل واتساب وقوالب التحقق OTP.",
      secrets: [
        { name: "WHATSAPP_ACCESS_TOKEN", desc: "رمز الوصول الدائم لحساب واتساب للأعمال (System User Token)" },
        { name: "WHATSAPP_WEBHOOK_VERIFY_TOKEN", desc: "رمز التحقق المستخدم لتسجيل الويب هوك داخل لوحة ميتا" },
      ],
    },
    {
      title: "تخزين الملفات عبر MinIO S3",
      icon: HardDrive,
      color: "text-blue-500",
      description: "أرشفة كافة المستندات والوسائط الواردة على خادم MinIO المستقل.",
      secrets: [
        { name: "MINIO_ENDPOINT", desc: "https://minio.alazab.cloud" },
        { name: "MINIO_BUCKET", desc: "اسم الحاوية (Bucket) الخاصة بالوسائط" },
        { name: "MINIO_ACCESS_KEY & MINIO_SECRET_KEY", desc: "بيانات اعتماد الدخول والتوقيع SigV4" },
      ],
    },
    {
      title: "خوادم MCP للذكاء الاصطناعي",
      icon: Terminal,
      color: "text-amber-500",
      description: "نقاط الاتصال بـ Daftra المحاسبي، و magicplan، و UberFix لمساعدي الذكاء الاصطناعي.",
      secrets: [
        { name: "MCP_ACCESS_KEY", desc: "المفتاح الموحد لحماية وتوثيق استدعاءات الـ MCP" },
        { name: "DAFTRA_API_KEY & DAFTRA_SUBDOMAIN", desc: "بيانات الاتصال بنظام دفترة المحاسبي" },
        { name: "MAGICPLAN_API_KEY & CUSTOMER_ID", desc: "بيانات اعتماد واجهة magicplan" },
        { name: "UBERFIX_API_KEY", desc: "مفتاح بوابة الصيانة UberFix" },
      ],
    },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeading
        title="مفاتيح الربط والـ API"
        subtitle="إدارة بيانات الربط المباشرة مع Meta و MinIO ومحركات MCP"
      />

      <div className="border border-border/80 rounded-xl bg-card p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="text-primary" size={22} />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">الحماية وحفظ الأسرار</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              وفقاً لقواعد الأمان المعيارية للتطبيق، لا تُخزّن مفاتيح الإنتاج السرية داخل المتصفح إطلاقاً لتفادي أي تسريب.
              يتم حفظ كافة المتغيرات كأسرار آمنة مشفرة (Environment Secrets) في بيئة خادم Supabase.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        {integrations.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className="border border-border rounded-xl bg-card p-6 space-y-4 shadow-sm">
              <div className="flex items-center gap-3">
                <Icon className={item.color} size={22} />
                <h3 className="font-semibold text-foreground text-lg">{item.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{item.description}</p>

              <div className="space-y-2 pt-2">
                {item.secrets.map((sec, sIdx) => (
                  <div
                    key={sIdx}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/50 gap-2 text-sm"
                  >
                    <div>
                      <code className="font-mono font-medium text-foreground text-xs bg-background px-2 py-0.5 rounded border border-border">
                        {sec.name}
                      </code>
                      <span className="text-muted-foreground text-xs block sm:inline sm:mr-3 mt-1 sm:mt-0">
                        {sec.desc}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(sec.name, `${idx}-${sIdx}`)}
                      className="self-end sm:self-auto h-8 px-2 text-xs"
                    >
                      {copiedKey === `${idx}-${sIdx}` ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      <span className="mr-1">نسخ الاسم</span>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-5 rounded-xl border border-dashed border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="font-semibold text-sm">تعديل الأسرار في لوحة Supabase</h4>
          <p className="text-xs text-muted-foreground mt-1">
            يمكنك تعيين هذه القيم مباشرة من خلال لوحة تحكم المشروع تحت تبويب Edge Functions Secrets.
          </p>
        </div>
        <Button asChild variant="outline">
          <a
            href="https://supabase.com/dashboard/project/vlahgxkfpzappxtiwhvd/settings/functions"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2"
          >
            <span>فتح لوحة الأسرار</span>
            <ExternalLink size={14} />
          </a>
        </Button>
      </div>
    </div>
  );
}
