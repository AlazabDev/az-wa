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
import { Plus, Search, Clock, User, MapPin, Wrench, AlertTriangle } from "lucide-react";

const requests = [
  { id: 1, title: "تسريب مياه - الطابق الثالث", building: "برج السلام السكني", client: "شركة الأفق", priority: "عاجل", status: "open", assignee: "فريق السباكة", date: "2024-12-01", description: "تسريب مياه من السقف في الشقة 305" },
  { id: 2, title: "صيانة مصعد رقم 2", building: "مجمع النور التجاري", client: "مؤسسة النور", priority: "متوسط", status: "in_progress", assignee: "فريق المصاعد", date: "2024-11-28", description: "المصعد يتوقف بين الطوابق بشكل متكرر" },
  { id: 3, title: "إصلاح لوحة كهربائية", building: "فيلا الورد", client: "أحمد العلي", priority: "عادي", status: "open", assignee: "غير معين", date: "2024-11-25", description: "اللوحة الكهربائية الرئيسية تحتاج استبدال" },
  { id: 4, title: "تشققات في الجدار الخارجي", building: "مبنى إداري - الملك فهد", client: "بنك الاستثمار", priority: "متوسط", status: "completed", assignee: "فريق البناء", date: "2024-11-20", description: "تشققات ظاهرة في الواجهة الغربية" },
  { id: 5, title: "تسريب سقف - غرفة الاجتماعات", building: "مجمع النور التجاري", client: "مؤسسة النور", priority: "عاجل", status: "in_progress", assignee: "فريق العزل", date: "2024-12-02", description: "تسريب مياه أمطار من السقف" },
  { id: 6, title: "صيانة نظام التكييف المركزي", building: "برج السلام السكني", client: "شركة الأفق", priority: "عادي", status: "open", assignee: "فريق التكييف", date: "2024-11-30", description: "صيانة دورية لنظام التكييف" },
];

const priorityMap: Record<string, { label: string; variant: "destructive" | "secondary" | "default" }> = {
  "عاجل": { label: "عاجل", variant: "destructive" },
  "متوسط": { label: "متوسط", variant: "secondary" },
  "عادي": { label: "عادي", variant: "default" },
};

const statusMap: Record<string, { label: string; color: string }> = {
  open: { label: "مفتوح", color: "bg-warning/10 text-warning" },
  in_progress: { label: "قيد التنفيذ", color: "bg-info/10 text-info" },
  completed: { label: "مكتمل", color: "bg-success/10 text-success" },
};

export default function Maintenance() {
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");

  const filtered = requests.filter((r) => {
    const matchSearch = r.title.includes(search) || r.building.includes(search);
    const matchPriority = filterPriority === "all" || r.priority === filterPriority;
    return matchSearch && matchPriority;
  });

  return (
    <AppLayout
      title="طلبات الصيانة"
      subtitle="استقبال وتتبع طلبات الصيانة والإصلاح"
      actions={
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" className="gradient-primary text-primary-foreground">
              <Plus className="h-4 w-4 ml-1" />
              طلب جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader><DialogTitle>إنشاء طلب صيانة جديد</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-4">
              <div><Label>عنوان الطلب</Label><Input placeholder="مثال: تسريب مياه" className="mt-1" /></div>
              <div><Label>المبنى / الموقع</Label><Input placeholder="اسم المبنى أو الموقع" className="mt-1" /></div>
              <div><Label>الأولوية</Label>
                <Select><SelectTrigger className="mt-1"><SelectValue placeholder="اختر الأولوية" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">عاجل</SelectItem>
                    <SelectItem value="medium">متوسط</SelectItem>
                    <SelectItem value="normal">عادي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>تعيين لفريق</Label>
                <Select><SelectTrigger className="mt-1"><SelectValue placeholder="اختر الفريق" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plumbing">فريق السباكة</SelectItem>
                    <SelectItem value="electrical">فريق الكهرباء</SelectItem>
                    <SelectItem value="ac">فريق التكييف</SelectItem>
                    <SelectItem value="building">فريق البناء</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>الوصف</Label><Textarea placeholder="اشرح المشكلة بالتفصيل..." className="mt-1" /></div>
              <div className="flex justify-end gap-2">
                <Button variant="outline">إلغاء</Button>
                <Button className="gradient-primary text-primary-foreground">إنشاء الطلب</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="بحث في طلبات الصيانة..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
          </div>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الأولويات</SelectItem>
              <SelectItem value="عاجل">عاجل</SelectItem>
              <SelectItem value="متوسط">متوسط</SelectItem>
              <SelectItem value="عادي">عادي</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          {filtered.map((req) => {
            const priority = priorityMap[req.priority];
            const status = statusMap[req.status];
            return (
              <Card key={req.id} className="shadow-card hover:shadow-card-hover transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold">{req.title}</h3>
                        <Badge variant={priority.variant} className="text-xs">{priority.label}</Badge>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{req.description}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{req.building}</span>
                        <span className="flex items-center gap-1"><User className="h-3 w-3" />{req.client}</span>
                        <span className="flex items-center gap-1"><Wrench className="h-3 w-3" />{req.assignee}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{req.date}</span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="text-xs shrink-0">تفاصيل</Button>
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
