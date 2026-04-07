import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Send, Eye, Search } from "lucide-react";

interface Template {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  wabaName: string;
  wabaId: string;
  bodyText: string;
  hasButtons: boolean;
  buttonTexts: string[];
  headerType?: string;
  footerText?: string;
}

const templates: Template[] = [
  // WABA: Mohamed Azab (3773448776290331) - +20 10 04006620
  { id: "4298069390465341", name: "technician_assigned", category: "UTILITY", language: "ar", status: "APPROVED", wabaName: "Mohamed Azab", wabaId: "3773448776290331", bodyText: "تم تعيين فني لطلب الصيانة الخاص بك.\n\nرقم الطلب {{order_id}}\nالفني {{technician_name}}\nالموعد {{date}} - {{time}}\n\nسيتم التواصل معك قبل الزيارة.", hasButtons: false, buttonTexts: [] },
  { id: "2068093277343758", name: "booking_confirmation", category: "UTILITY", language: "ar", status: "APPROVED", wabaName: "Mohamed Azab", wabaId: "3773448776290331", bodyText: "تم تأكيد حجزك بنجاح ✅\n\nتفاصيل الحجز:\nرقم الطلب {{order_number}}\nالخدمة {{service_type}}\nالتاريخ {{appointment_date}} في {{appointment_time}}\nالموقع {{location}}\nالفني المختص {{technician_name}}", hasButtons: true, buttonTexts: ["تتبع الطلب", "إلغاء الحجز"] },
  { id: "714201091490383", name: "order_created", category: "UTILITY", language: "ar", status: "APPROVED", wabaName: "Mohamed Azab", wabaId: "3773448776290331", bodyText: "تم استلام طلب الصيانة بنجاح.\n\nرقم الطلب: {{order_id}}\nالخدمة: {{service_name}}\nالموقع: {{location}}\n\nسيتم مراجعة الطلب والتواصل معك قريباً.", hasButtons: false, buttonTexts: [] },
  { id: "1961865481091790", name: "test_service", category: "MARKETING", language: "ar", status: "APPROVED", wabaName: "Mohamed Azab", wabaId: "3773448776290331", bodyText: "مرحباً {{customer_name}}، هذه رسالة اختبار للتأكد من عمل خدمة WhatsApp بشكل صحيح. شكراً لك!", hasButtons: true, buttonTexts: ["تم الفهم ✓"] },

  // WABA: Mohamed Azab (1485981793093019) - Alazab +20 10 26762988
  { id: "921113394129141", name: "order_management", category: "UTILITY", language: "ar", status: "APPROVED", wabaName: "Alazab", wabaId: "1485981793093019", bodyText: "مرحبا {{1}}،\n\nتم تقديم طلبك {{2}} بنجاح مع {{3}} ويجري معالجتها.", hasButtons: true, buttonTexts: ["عرض الطلب"], headerType: "TEXT" },
  { id: "1618737392579524", name: "missed_appointment", category: "UTILITY", language: "ar", status: "APPROVED", wabaName: "Alazab", wabaId: "1485981793093019", bodyText: "مرحبًا {{1}}، افتقدناك في موعدك المجدول {{2}} في {{3}}. يرجى الرد لإعادة الجدولة أو الاتصال بـ {{4}} لحجز موعد جديد.", hasButtons: true, buttonTexts: ["إعادة الجدولة"], headerType: "TEXT" },
  { id: "952752170469820", name: "hello", category: "MARKETING", language: "en_US", status: "APPROVED", wabaName: "Alazab", wabaId: "1485981793093019", bodyText: "Hello 👋\nWe are the Brand Identity team from Al-Azab Company.\n\nWe help you professionally prepare your store to reflect your brand identity and attract customers at first glance.", hasButtons: false, buttonTexts: [], headerType: "IMAGE", footerText: "Alazab Group" },

  // WABA: Mohamed Azab (2144651456337012) - +1 205-460-5650
  { id: "2013168046210404", name: "order_cancellation_confirmed", category: "UTILITY", language: "ar", status: "APPROVED", wabaName: "Mohamed Azab", wabaId: "2144651456337012", bodyText: "مرحباً، نؤكد لك أننا ألغينا بنجاح طلبك رقم {{order_number}} الذي قدمته مؤخراً. شكراً لك.", hasButtons: true, buttonTexts: ["طلب جديد", "تواصل معنا"] },
  { id: "2407201083053535", name: "feedback_request", category: "UTILITY", language: "ar", status: "APPROVED", wabaName: "Mohamed Azab", wabaId: "2144651456337012", bodyText: "إننا في {{company_name}}، نولي اهتماماً كبيراً لملاحظات العملاء ونستفيد منها في تحسين {{service_name}} باستمرار.", hasButtons: true, buttonTexts: ["قيّم الخدمة", "لاحقاً"] },
  { id: "902577505870023", name: "technician_visit_scheduling", category: "UTILITY", language: "ar", status: "APPROVED", wabaName: "Mohamed Azab", wabaId: "2144651456337012", bodyText: "مرحباً {{customer_name}}، نحن نحدد موعداً لزيارة فني لـ {{service_type}} في {{visit_date}} بين {{start_time}} و {{end_time}}. يرجى تأكيد ما إذا كانت هذه الفترة مناسبة لك.", hasButtons: true, buttonTexts: ["تأكيد الموعد", "طلب تعديل", "إلغاء"] },
  { id: "4406866926209518", name: "support_call_request", category: "MARKETING", language: "ar", status: "APPROVED", wabaName: "Mohamed Azab", wabaId: "2144651456337012", bodyText: "هل ترغب في تلقي مكالمة من أحد ممثلينا؟ نحن هنا لمساعدتك.", hasButtons: true, buttonTexts: ["نعم، اتصلوا بي", "لا، شكراً"] },

  // WABA: Mohamed Azab (1458856398934130) - +1 206-479-5608 & +1 208-379-9564
  { id: "1550461489580784", name: "uberone", category: "MARKETING", language: "en_US", status: "APPROVED", wabaName: "Mohamed Azab", wabaId: "1458856398934130", bodyText: "There's a Difference Between Requesting Maintenance and *Managing* It.", hasButtons: true, buttonTexts: ["View Flow"], headerType: "VIDEO", footerText: "UberFix Maintenance Solutions" },
  { id: "925222166624859", name: "appointment_scheduling", category: "UTILITY", language: "ar", status: "APPROVED", wabaName: "Mohamed Azab", wabaId: "1458856398934130", bodyText: "مرحبًا {{1}}، نحن نحدد موعدًا لزيارة فني لـ {{2}} في {{3}} بين {{4}} و {{5}}. يرجى تأكيد ما إذا كانت هذه الفترة مناسبة لك.", hasButtons: true, buttonTexts: ["أكد", "إعادة الجدولة"], headerType: "TEXT" },
  { id: "1607982397051161", name: "booking_confirmation_admin", category: "MARKETING", language: "ar", status: "APPROVED", wabaName: "Mohamed Azab", wabaId: "1458856398934130", bodyText: "🔔 طلب حجز استشارة جديد\n\n👤 الاسم: {{full_name}}\n📧 البريد: {{email}}\n📱 الهاتف: {{phone}}\n🔧 الخدمة: {{service_type}}\n📅 التاريخ: {{date}}\n🕐 الوقت: {{time}}\n\n📋 رقم الحجز: {{booking_id}}", hasButtons: false, buttonTexts: [], footerText: "UberFix Admin Notification" },
  { id: "828024176950673", name: "maintenance_request_form", category: "MARKETING", language: "en", status: "APPROVED", wabaName: "Mohamed Azab", wabaId: "1458856398934130", bodyText: "Hello world!", hasButtons: true, buttonTexts: ["View Flow"] },
  { id: "873771338835468", name: "delivery_code", category: "AUTHENTICATION", language: "en_US", status: "APPROVED", wabaName: "Mohamed Azab", wabaId: "1458856398934130", bodyText: "Your order is arriving soon. *{{1}}* is your verification code. Please show this to the delivery associate.", hasButtons: true, buttonTexts: [] },

  // WABA: alazab (459851797218855) - +1 555-728-5727 & +1 555-724-5001
  { id: "feedback_form_id", name: "feedback_form", category: "UTILITY", language: "ar", status: "APPROVED", wabaName: "alazab", wabaId: "459851797218855", bodyText: "نموذج تقييم الخدمة", hasButtons: true, buttonTexts: ["فتح النموذج"] },
  { id: "shifting_journey_id", name: "shifting_journey", category: "UTILITY", language: "ar", status: "APPROVED", wabaName: "alazab", wabaId: "459851797218855", bodyText: "رحلة النقل والتحويل", hasButtons: false, buttonTexts: [] },
  { id: "technician_arrival_id", name: "technician_arrival", category: "UTILITY", language: "ar", status: "APPROVED", wabaName: "alazab", wabaId: "459851797218855", bodyText: "وصول الفني إلى الموقع", hasButtons: false, buttonTexts: [] },
  { id: "appointment_scheduling_alazab", name: "appointment_scheduling", category: "UTILITY", language: "ar", status: "APPROVED", wabaName: "alazab", wabaId: "459851797218855", bodyText: "جدولة المواعيد", hasButtons: true, buttonTexts: ["تأكيد", "إعادة الجدولة"] },
  { id: "statement_available_id", name: "statement_available", category: "UTILITY", language: "ar", status: "APPROVED", wabaName: "alazab", wabaId: "459851797218855", bodyText: "كشف حساب متاح", hasButtons: false, buttonTexts: [] },
  { id: "invoice_available_id", name: "invoice_available", category: "MARKETING", language: "ar", status: "APPROVED", wabaName: "alazab", wabaId: "459851797218855", bodyText: "فاتورة متاحة للعميل", hasButtons: false, buttonTexts: [] },
  { id: "order_canceled_id", name: "order_canceled", category: "UTILITY", language: "ar", status: "APPROVED", wabaName: "alazab", wabaId: "459851797218855", bodyText: "إلغاء الطلب", hasButtons: false, buttonTexts: [] },
  { id: "technician_visit_id", name: "technician_visit", category: "UTILITY", language: "ar", status: "APPROVED", wabaName: "alazab", wabaId: "459851797218855", bodyText: "زيارة الفني", hasButtons: false, buttonTexts: [] },
  { id: "support_id", name: "support", category: "UTILITY", language: "ar", status: "APPROVED", wabaName: "alazab", wabaId: "459851797218855", bodyText: "طلب دعم فني", hasButtons: false, buttonTexts: [] },
  { id: "uberfix_id", name: "uberfix", category: "MARKETING", language: "ar", status: "APPROVED", wabaName: "alazab", wabaId: "459851797218855", bodyText: "UberFix للصيانة", hasButtons: false, buttonTexts: [] },
];

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  APPROVED: { label: "معتمد", variant: "default" },
  PENDING: { label: "قيد المراجعة", variant: "secondary" },
  REJECTED: { label: "مرفوض", variant: "destructive" },
  PAUSED: { label: "متوقف", variant: "outline" },
};

const categoryMap: Record<string, string> = {
  MARKETING: "تسويقي",
  UTILITY: "خدمي",
  AUTHENTICATION: "مصادقة",
};

const languageMap: Record<string, string> = {
  ar: "عربي",
  en: "إنجليزي",
  en_US: "إنجليزي",
};

export default function Templates() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterWaba, setFilterWaba] = useState("all");

  const wabaNames = [...new Set(templates.map(t => t.wabaName))];

  const filtered = templates.filter((t) => {
    const matchSearch = t.name.includes(search) || t.bodyText.includes(search);
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    const matchCategory = filterCategory === "all" || t.category === filterCategory;
    const matchWaba = filterWaba === "all" || t.wabaName === filterWaba;
    return matchSearch && matchStatus && matchCategory && matchWaba;
  });

  return (
    <AppLayout
      title="القوالب"
      subtitle={`${templates.length} قالب عبر ${wabaNames.length} حسابات WABA`}
      actions={
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" className="gradient-primary text-primary-foreground">
              <Plus className="h-4 w-4 ml-1" />
              إنشاء قالب
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl" dir="rtl">
            <DialogHeader><DialogTitle>إنشاء قالب جديد</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="space-y-4">
                <div><Label>اسم القالب</Label><Input placeholder="مثال: إشعار_صيانة" className="mt-1" /></div>
                <div><Label>حساب WABA</Label>
                  <Select><SelectTrigger className="mt-1"><SelectValue placeholder="اختر الحساب" /></SelectTrigger>
                    <SelectContent>
                      {wabaNames.map(name => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>التصنيف</Label>
                  <Select><SelectTrigger className="mt-1"><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MARKETING">تسويقي</SelectItem>
                      <SelectItem value="UTILITY">خدمي</SelectItem>
                      <SelectItem value="AUTHENTICATION">مصادقة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>اللغة</Label>
                  <Select><SelectTrigger className="mt-1"><SelectValue placeholder="اختر اللغة" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ar">العربية</SelectItem>
                      <SelectItem value="en">الإنجليزية</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>نص الرسالة</Label>
                  <Textarea placeholder="اكتب نص القالب... استخدم {{1}} للمتغيرات" className="mt-1 min-h-[100px]" />
                  <p className="text-xs text-muted-foreground mt-1">استخدم {"{{1}}"}, {"{{2}}"} أو {"{{param_name}}"} لإضافة متغيرات</p>
                </div>
              </div>
              <div>
                <Label className="mb-2 block">معاينة</Label>
                <div className="rounded-2xl border bg-muted/30 p-4 min-h-[300px]">
                  <div className="bg-card rounded-xl p-4 shadow-card max-w-[250px] mr-auto">
                    <p className="text-sm leading-relaxed text-foreground">مرحباً أحمد، تم تحديد موعد الصيانة يوم الأحد الساعة 10 صباحاً.</p>
                    <p className="text-[10px] text-muted-foreground mt-2 text-left" dir="ltr">12:30 PM ✓✓</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline">حفظ كمسودة</Button>
              <Button className="gradient-primary text-primary-foreground">
                <Send className="h-4 w-4 ml-1" />إرسال للموافقة
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="بحث في القوالب..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الحالات</SelectItem>
              <SelectItem value="APPROVED">معتمد</SelectItem>
              <SelectItem value="PENDING">قيد المراجعة</SelectItem>
              <SelectItem value="REJECTED">مرفوض</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الأنواع</SelectItem>
              <SelectItem value="UTILITY">خدمي</SelectItem>
              <SelectItem value="MARKETING">تسويقي</SelectItem>
              <SelectItem value="AUTHENTICATION">مصادقة</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterWaba} onValueChange={setFilterWaba}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الحسابات</SelectItem>
              {wabaNames.map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground">{filtered.length} قالب من أصل {templates.length}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((template) => {
            const status = statusMap[template.status] || statusMap.APPROVED;
            return (
              <Card key={template.id} className="shadow-card hover:shadow-card-hover transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm font-semibold font-mono" dir="ltr">{template.name}</CardTitle>
                    <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                  </div>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{categoryMap[template.category] || template.category}</Badge>
                    <Badge variant="outline" className="text-[10px]">{languageMap[template.language] || template.language}</Badge>
                    {template.hasButtons && <Badge variant="outline" className="text-[10px]">أزرار</Badge>}
                    {template.headerType && <Badge variant="outline" className="text-[10px]">{template.headerType === "IMAGE" ? "صورة" : template.headerType === "VIDEO" ? "فيديو" : "عنوان"}</Badge>}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-2 line-clamp-3 leading-relaxed">{template.bodyText}</p>
                  {template.buttonTexts.length > 0 && (
                    <div className="flex gap-1 flex-wrap mb-2">
                      {template.buttonTexts.map((btn, idx) => (
                        <span key={idx} className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5">{btn}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground">WABA: {template.wabaName}</p>
                    <Button variant="outline" size="sm" className="text-xs h-7"><Eye className="h-3 w-3 ml-1" />معاينة</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
