import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, GitBranch, Play, Pause, Eye, Trash2, Search, ArrowLeft, MessageSquare, ListChecks, SplitSquareHorizontal, Send } from "lucide-react";

const flows = [
  { id: 1, name: "تسجيل العملاء", status: "PUBLISHED", account: "متجر الإلكترونيات", steps: 5, responses: 1240, lastEdited: "قبل 3 أيام" },
  { id: 2, name: "استطلاع رضا العملاء", status: "DRAFT", account: "مطعم السعادة", steps: 4, responses: 0, lastEdited: "اليوم" },
  { id: 3, name: "حجز موعد", status: "PUBLISHED", account: "عيادة الصحة", steps: 6, responses: 890, lastEdited: "قبل أسبوع" },
  { id: 4, name: "دعم فني", status: "DEPRECATED", account: "متجر الإلكترونيات", steps: 8, responses: 3200, lastEdited: "قبل شهر" },
  { id: 5, name: "طلب خدمة", status: "DRAFT", account: "متجر الأزياء", steps: 3, responses: 0, lastEdited: "أمس" },
];

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PUBLISHED: { label: "منشور", variant: "default" },
  DRAFT: { label: "مسودة", variant: "secondary" },
  DEPRECATED: { label: "متوقف", variant: "outline" },
};

export default function Flows() {
  const [search, setSearch] = useState("");

  const filtered = flows.filter((f) => f.name.includes(search));

  return (
    <AppLayout
      title="التدفقات"
      subtitle="إنشاء وإدارة تدفقات المحادثات التفاعلية"
      actions={
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" className="gradient-whatsapp text-primary-foreground">
              <Plus className="h-4 w-4 ml-1" />
              إنشاء تدفق
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl" dir="rtl">
            <DialogHeader>
              <DialogTitle>إنشاء تدفق جديد</DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>اسم التدفق</Label>
                  <Input placeholder="مثال: تسجيل العملاء" className="mt-1" />
                </div>
                <div>
                  <Label>الحساب</Label>
                  <Select>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الحساب" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">متجر الإلكترونيات</SelectItem>
                      <SelectItem value="2">مطعم السعادة</SelectItem>
                      <SelectItem value="3">متجر الأزياء</SelectItem>
                      <SelectItem value="4">عيادة الصحة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Visual Flow Builder Preview */}
              <div>
                <Label className="mb-2 block">بناء التدفق</Label>
                <div className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-6 min-h-[300px]">
                  <div className="flex flex-col items-center gap-4">
                    {/* Start Node */}
                    <div className="rounded-xl border-2 border-primary bg-accent p-4 w-56 text-center">
                      <div className="flex items-center justify-center gap-2 text-primary font-medium text-sm">
                        <Play className="h-4 w-4" />
                        بداية التدفق
                      </div>
                    </div>
                    <ArrowLeft className="h-5 w-5 text-muted-foreground rotate-[-90deg]" />

                    {/* Message Node */}
                    <div className="rounded-xl border bg-card p-4 w-56 shadow-card">
                      <div className="flex items-center gap-2 text-sm font-medium mb-2">
                        <MessageSquare className="h-4 w-4 text-info" />
                        رسالة ترحيبية
                      </div>
                      <p className="text-xs text-muted-foreground">مرحباً! كيف يمكنني مساعدتك؟</p>
                    </div>
                    <ArrowLeft className="h-5 w-5 text-muted-foreground rotate-[-90deg]" />

                    {/* Choice Node */}
                    <div className="rounded-xl border bg-card p-4 w-56 shadow-card">
                      <div className="flex items-center gap-2 text-sm font-medium mb-2">
                        <ListChecks className="h-4 w-4 text-warning" />
                        خيارات
                      </div>
                      <div className="space-y-1">
                        <Badge variant="outline" className="text-xs w-full justify-center">استفسار عام</Badge>
                        <Badge variant="outline" className="text-xs w-full justify-center">دعم فني</Badge>
                        <Badge variant="outline" className="text-xs w-full justify-center">شكوى</Badge>
                      </div>
                    </div>
                    <ArrowLeft className="h-5 w-5 text-muted-foreground rotate-[-90deg]" />

                    {/* Branch Node */}
                    <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/30 p-4 w-56 text-center">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                        <SplitSquareHorizontal className="h-4 w-4" />
                        إضافة خطوة جديدة
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline">حفظ كمسودة</Button>
              <Button className="gradient-whatsapp text-primary-foreground">
                <Send className="h-4 w-4 ml-1" />
                إرسال للموافقة
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-4">
        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث في التدفقات..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>

        {/* Flows Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((flow) => {
            const status = statusMap[flow.status];
            return (
              <Card key={flow.id} className="shadow-card hover:shadow-card-hover transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-primary" />
                      {flow.name}
                    </CardTitle>
                    <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3">الحساب: {flow.account}</p>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center rounded-lg bg-muted/50 p-2">
                      <p className="text-sm font-bold">{flow.steps}</p>
                      <p className="text-[10px] text-muted-foreground">خطوات</p>
                    </div>
                    <div className="text-center rounded-lg bg-muted/50 p-2">
                      <p className="text-sm font-bold">{flow.responses.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">ردود</p>
                    </div>
                    <div className="text-center rounded-lg bg-muted/50 p-2">
                      <p className="text-[10px] text-muted-foreground">{flow.lastEdited}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 text-xs">
                      <Eye className="h-3 w-3 ml-1" />
                      عرض
                    </Button>
                    {flow.status === "PUBLISHED" ? (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-warning">
                        <Pause className="h-3.5 w-3.5" />
                      </Button>
                    ) : flow.status === "DRAFT" ? (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-success">
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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
