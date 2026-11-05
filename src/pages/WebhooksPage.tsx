import DraftManager from "@/components/DraftManager";
import { PageHeading } from "@/components/WorkspaceUI";
import { Globe } from "lucide-react";
import { toast } from "sonner";

const WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/whatsapp-webhook`;

export default function WebhooksPage() {
  return <>
    <PageHeading title="ويبهوكس" subtitle="استقبال رسائل وحالات التسليم من ميتا" />
    <div className="border-r-2 border-primary bg-primary/10 p-4 text-sm mb-6 space-y-2">
      <div className="flex items-center gap-2 font-semibold"><Globe size={16} /> رابط الاستقبال الحقيقي مع ميتا</div>
      <p>سجّل هذا الرابط في لوحة ميتا (WhatsApp &gt; Configuration &gt; Webhook) مع رمز التحقق المحفوظ في إعدادات المشروع (WHATSAPP_WEBHOOK_VERIFY_TOKEN):</p>
      <div className="flex items-center gap-2">
        <code dir="ltr" className="bg-background border border-border rounded px-2 py-1 text-xs flex-1 overflow-x-auto whitespace-nowrap">{WEBHOOK_URL}</code>
        <button onClick={() => { navigator.clipboard.writeText(WEBHOOK_URL); toast.success("تم نسخ الرابط"); }} className="text-primary text-sm underline shrink-0">نسخ</button>
      </div>
    </div>
    <DraftManager section="webhooks" title="مسودات ويبهوك" singular="إعداد ويبهوك" categories={["رسائل واردة", "حالة الرسائل", "وسائط"]} />
  </>;
}
