import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Search, MapPin, Calendar, User, MoreVertical } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const projects = [
  {
    id: 1,
    name: "برج السلام السكني",
    client: "شركة الأفق",
    location: "الرياض - حي النخيل",
    status: "active",
    type: "بناء",
    progress: 65,
    startDate: "2024-01-15",
    endDate: "2025-06-30",
    budget: "4,500,000 ر.س",
  },
  {
    id: 2,
    name: "صيانة مجمع النور التجاري",
    client: "مؤسسة النور",
    location: "جدة - حي الروضة",
    status: "active",
    type: "صيانة",
    progress: 40,
    startDate: "2024-06-01",
    endDate: "2024-12-31",
    budget: "850,000 ر.س",
  },
  {
    id: 3,
    name: "ترميم فيلا الياسمين",
    client: "أحمد العلي",
    location: "الدمام - حي الفيحاء",
    status: "completed",
    type: "ترميم",
    progress: 100,
    startDate: "2024-02-01",
    endDate: "2024-08-15",
    budget: "320,000 ر.س",
  },
  {
    id: 4,
    name: "بناء مستودعات صناعية",
    client: "شركة الصناعات المتقدمة",
    location: "الرياض - المدينة الصناعية",
    status: "planning",
    type: "بناء",
    progress: 10,
    startDate: "2025-01-01",
    endDate: "2026-03-30",
    budget: "7,200,000 ر.س",
  },
  {
    id: 5,
    name: "تجديد واجهات مبنى إداري",
    client: "بنك الاستثمار",
    location: "الرياض - طريق الملك فهد",
    status: "active",
    type: "ترميم",
    progress: 80,
    startDate: "2024-04-01",
    endDate: "2024-11-30",
    budget: "1,100,000 ر.س",
  },
  {
    id: 6,
    name: "إنشاء مجمع سكني",
    client: "شركة الإعمار",
    location: "جدة - أبحر الشمالية",
    status: "planning",
    type: "بناء",
    progress: 5,
    startDate: "2025-03-01",
    endDate: "2027-01-30",
    budget: "15,000,000 ر.س",
  },
];

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  active: { label: "قيد التنفيذ", variant: "default" },
  completed: { label: "مكتمل", variant: "secondary" },
  planning: { label: "تخطيط", variant: "outline" },
};

const typeColors: Record<string, string> = {
  بناء: "bg-primary/10 text-primary",
  صيانة: "bg-warning/10 text-warning",
  ترميم: "bg-info/10 text-info",
};

export default function Projects() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const filtered = projects.filter((p) => {
    const matchSearch = p.name.includes(search) || p.client.includes(search);
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <AppLayout
      title="المشاريع"
      subtitle="إدارة وتتبع جميع مشاريع البناء والصيانة"
      actions={
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" className="gradient-primary text-primary-foreground">
              <Plus className="h-4 w-4 ml-1" />
              مشروع جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader>
              <DialogTitle>إنشاء مشروع جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>اسم المشروع</Label>
                <Input placeholder="مثال: بناء برج سكني" className="mt-1" />
              </div>
              <div>
                <Label>العميل</Label>
                <Select>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر العميل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">شركة الأفق</SelectItem>
                    <SelectItem value="2">مؤسسة النور</SelectItem>
                    <SelectItem value="3">أحمد العلي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>نوع المشروع</Label>
                <Select>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر النوع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="build">بناء</SelectItem>
                    <SelectItem value="maintenance">صيانة</SelectItem>
                    <SelectItem value="renovation">ترميم</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الموقع</Label>
                <Input placeholder="المدينة - الحي" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>تاريخ البدء</Label>
                  <Input type="date" className="mt-1" />
                </div>
                <div>
                  <Label>تاريخ الانتهاء</Label>
                  <Input type="date" className="mt-1" />
                </div>
              </div>
              <div>
                <Label>الميزانية</Label>
                <Input placeholder="مثال: 1,000,000 ر.س" className="mt-1" />
              </div>
              <div>
                <Label>ملاحظات</Label>
                <Textarea placeholder="تفاصيل إضافية..." className="mt-1" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline">إلغاء</Button>
                <Button className="gradient-primary text-primary-foreground">إنشاء المشروع</Button>
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
            <Input
              placeholder="بحث في المشاريع..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الحالات</SelectItem>
              <SelectItem value="active">قيد التنفيذ</SelectItem>
              <SelectItem value="completed">مكتمل</SelectItem>
              <SelectItem value="planning">تخطيط</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project) => {
            const status = statusMap[project.status] ?? statusMap["planning"]!;
            return (
              <Card
                key={project.id}
                className="shadow-card hover:shadow-card-hover transition-shadow"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold">{project.name}</CardTitle>
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        {project.client}
                      </div>
                    </div>
                    <Badge variant={status.variant} className="text-xs">
                      {status.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {project.location}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${typeColors[project.type]}`}
                    >
                      {project.type}
                    </span>
                    <span className="text-xs text-muted-foreground">{project.budget}</span>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">التقدم</span>
                      <span className="font-medium">{project.progress}%</span>
                    </div>
                    <Progress value={project.progress} className="h-1.5" />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {project.startDate} → {project.endDate}
                    </span>
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
