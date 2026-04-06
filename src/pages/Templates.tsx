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
import { Plus, FileText, Send, Eye, Trash2, Search } from "lucide-react";

const templates = [
  { id: 1, name: "تأكيد موعد صيانة", category: "UTILITY", language: "ar", status: "APPROVED", account: "شركة الأفق", body: "مرحباً {{1}}، تم تحديد موعد الصيانة يوم {{2}} الساعة {{3}}. فريق {{4}} سيكون في الموقع." },
  { id: 2, name: "إشعار بدء أعمال", category: "UTILITY", language: "ar", status: "APPROVED", account: "إدارة المشاريع", body: "نود إبلاغكم أن أعمال {{1}} في مشروع {{2}} ستبدأ بتاريخ {{3}}. يرجى اتخاذ الاحتياطات اللازمة." },
  { id: 3, name: "تقرير تقدم المشروع", category: "UTILITY", language: "ar", status: "PENDING", account: "إدارة المشاريع", body: "تقرير تقدم مشروع {{1}}: نسبة الإنجاز {{2}}%. المرحلة الحالية: {{3}}. الموعد المتوقع للانتهاء: {{4}}." },
  { id: 4, name: "طلب موافقة عميل", category: "UTILITY", language: "ar", status: "APPROVED", account: "العملاء", body: "عزيزنا {{1}}، يرجى مراجعة والموافقة على {{2}} لمشروع {{3}}. رابط المراجعة: {{4}}" },
  { id: 5, name: "عرض خدمات صيانة", category: "MARKETING", language: "ar", status: "REJECTED", account: "التسويق", body: "خصم {{1}}% على عقود الصيانة السنوية! تشمل: صيانة {{2}} و{{3}}. تواصل معنا: {{4}}" },
  { id: 6, name: "إشعار اكتمال أعمال", category: "UTILITY", language: "ar", status: "PENDING", account: "إدارة المشاريع", body: "تم الانتهاء من أعمال {{1}} في {{2}}. يرجى المعاينة والتوقيع على محضر الاستلام." },
];

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  APPROVED: { label: "معتمد", variant: "default" },
  PENDING: { label: "قيد المراجعة", variant: "secondary" },
  REJECTED: { label: "مرفوض", variant: "destructive" },
};

const categoryMap: Record<string, string> = {
  MARKETING: "تسويقي",
  UTILITY: "خدمي",
  AUTHENTICATION: "مصادقة",
};

export default function Templates() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const filtered = templates.filter((t) => {
    const matchSearch = t.name.includes(search) || t.body.includes(search);
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <AppLayout
      title="القوالب"
      subtitle="إنشاء وإدارة قوالب رسائل المقاولات والصيانة"
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
                <div><Label>القسم</Label>
                  <Select><SelectTrigger className="mt-1"><SelectValue placeholder="اختر القسم" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="projects">إدارة المشاريع</SelectItem>
                      <SelectItem value="maintenance">الصيانة</SelectItem>
                      <SelectItem value="clients">العملاء</SelectItem>
                      <SelectItem value="marketing">التسويق</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>التصنيف</Label>
                  <Select><SelectTrigger className="mt-1"><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MARKETING">تسويقي</SelectItem>
                      <SelectItem value="UTILITY">خدمي</SelectItem>
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
                  <p className="text-xs text-muted-foreground mt-1">استخدم {"{{1}}"}, {"{{2}}"} لإضافة متغيرات</p>
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
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الحالات</SelectItem>
              <SelectItem value="APPROVED">معتمد</SelectItem>
              <SelectItem value="PENDING">قيد المراجعة</SelectItem>
              <SelectItem value="REJECTED">مرفوض</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((template) => {
            const status = statusMap[template.status];
            return (
              <Card key={template.id} className="shadow-card hover:shadow-card-hover transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm font-semibold">{template.name}</CardTitle>
                    <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">{categoryMap[template.category]}</Badge>
                    <Badge variant="outline" className="text-xs">{template.language === "ar" ? "عربي" : "إنجليزي"}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{template.body}</p>
                  <p className="text-xs text-muted-foreground mb-3">القسم: {template.account}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 text-xs"><Eye className="h-3 w-3 ml-1" />معاينة</Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
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
