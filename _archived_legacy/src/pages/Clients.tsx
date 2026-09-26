import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Search, Phone, Mail, Building2, FolderKanban } from "lucide-react";

const clients = [
  {
    id: 1,
    name: "شركة الأفق للتطوير العقاري",
    contact: "محمد الأحمد",
    phone: "+966 55 123 4567",
    email: "info@alofuq.sa",
    projects: 3,
    type: "شركة",
    status: "نشط",
  },
  {
    id: 2,
    name: "مؤسسة النور التجارية",
    contact: "خالد العمري",
    phone: "+966 50 987 6543",
    email: "khalid@alnoor.sa",
    projects: 2,
    type: "مؤسسة",
    status: "نشط",
  },
  {
    id: 3,
    name: "أحمد العلي",
    contact: "أحمد العلي",
    phone: "+966 54 111 2222",
    email: "ahmad@email.com",
    projects: 1,
    type: "فرد",
    status: "نشط",
  },
  {
    id: 4,
    name: "شركة الصناعات المتقدمة",
    contact: "سعد الدوسري",
    phone: "+966 56 333 4444",
    email: "saad@advanced.sa",
    projects: 1,
    type: "شركة",
    status: "نشط",
  },
  {
    id: 5,
    name: "بنك الاستثمار السعودي",
    contact: "فهد القحطاني",
    phone: "+966 50 555 6666",
    email: "fahad@bank.sa",
    projects: 1,
    type: "شركة",
    status: "غير نشط",
  },
  {
    id: 6,
    name: "شركة الإعمار",
    contact: "عبدالله السبيعي",
    phone: "+966 55 777 8888",
    email: "abdullah@emar.sa",
    projects: 2,
    type: "شركة",
    status: "نشط",
  },
];

const typeColors: Record<string, string> = {
  شركة: "bg-primary/10 text-primary",
  مؤسسة: "bg-info/10 text-info",
  فرد: "bg-warning/10 text-warning",
};

export default function Clients() {
  const [search, setSearch] = useState("");

  const filtered = clients.filter((c) => c.name.includes(search) || c.contact.includes(search));

  return (
    <AppLayout
      title="العملاء"
      subtitle="إدارة بيانات العملاء والتواصل معهم"
      actions={
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" className="gradient-primary text-primary-foreground">
              <Plus className="h-4 w-4 ml-1" />
              عميل جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة عميل جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>اسم العميل / الشركة</Label>
                <Input placeholder="مثال: شركة الأفق" className="mt-1" />
              </div>
              <div>
                <Label>جهة الاتصال</Label>
                <Input placeholder="اسم المسؤول" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>رقم الهاتف</Label>
                  <Input placeholder="+966 5X XXX XXXX" className="mt-1" dir="ltr" />
                </div>
                <div>
                  <Label>البريد الإلكتروني</Label>
                  <Input placeholder="email@example.com" className="mt-1" dir="ltr" />
                </div>
              </div>
              <div>
                <Label>العنوان</Label>
                <Input placeholder="المدينة - الحي" className="mt-1" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline">إلغاء</Button>
                <Button className="gradient-primary text-primary-foreground">إضافة العميل</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث في العملاء..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((client) => (
            <Card key={client.id} className="shadow-card hover:shadow-card-hover transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-sm font-semibold">{client.name}</CardTitle>
                  <Badge
                    variant={client.status === "نشط" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {client.status}
                  </Badge>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full w-fit ${typeColors[client.type]}`}
                >
                  {client.type}
                </span>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3" />
                  {client.contact}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  <span dir="ltr">{client.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  <span dir="ltr">{client.email}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t">
                  <FolderKanban className="h-3 w-3" />
                  {client.projects} مشاريع
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
