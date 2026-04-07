import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, Users, Wrench, HardHat, Phone, FileText, MessageSquare, Globe } from "lucide-react";

const stats = [
  { title: "حسابات WABA", value: "8", icon: Globe, change: "5 متصل", color: "text-primary" },
  { title: "أرقام مرتبطة", value: "7", icon: Phone, change: "جودة عالية", color: "text-success" },
  { title: "إجمالي القوالب", value: "76", icon: FileText, change: "عبر جميع الحسابات", color: "text-info" },
  { title: "المشاريع النشطة", value: "12", icon: FolderKanban, change: "+3 هذا الشهر", color: "text-warning" },
];

const wabaAccounts = [
  { name: "Mohamed Azab", wabaId: "3773448776290331", phone: "+20 10 04006620", templates: 4, status: "متصل", quality: "GREEN" },
  { name: "Alazab", wabaId: "1485981793093019", phone: "+20 10 26762988", templates: 4, status: "متصل", quality: "GREEN" },
  { name: "Mohamed Azab", wabaId: "2144651456337012", phone: "+1 205-460-5650", templates: 9, status: "متصل", quality: "GREEN" },
  { name: "Mohamed Azab", wabaId: "1458856398934130", phone: "+1 206-479-5608", templates: 20, status: "متصل", quality: "GREEN" },
  { name: "alazab", wabaId: "459851797218855", phone: "+1 555-728-5727", templates: 34, status: "متصل", quality: "GREEN" },
];

const recentTemplates = [
  { name: "technician_assigned", category: "UTILITY", language: "ar", waba: "Mohamed Azab", status: "APPROVED" },
  { name: "booking_confirmation", category: "UTILITY", language: "ar", waba: "Mohamed Azab", status: "APPROVED" },
  { name: "uberone", category: "MARKETING", language: "en_US", waba: "Mohamed Azab", status: "APPROVED" },
  { name: "feedback_form", category: "UTILITY", language: "ar", waba: "alazab", status: "APPROVED" },
  { name: "maintenance_request_form", category: "MARKETING", language: "en", waba: "Mohamed Azab", status: "APPROVED" },
];

const recentMaintenance = [
  { title: "تسريب مياه - الطابق 3", building: "برج السلام", priority: "عاجل", time: "منذ ساعة" },
  { title: "صيانة مصعد", building: "مجمع النور", priority: "متوسط", time: "منذ 3 ساعات" },
  { title: "إصلاح كهرباء", building: "فيلا الورد", priority: "عادي", time: "منذ يوم" },
];

const priorityMap: Record<string, "destructive" | "secondary" | "default"> = {
  "عاجل": "destructive",
  "متوسط": "secondary",
  "عادي": "default",
};

const categoryColors: Record<string, string> = {
  UTILITY: "bg-info/10 text-info",
  MARKETING: "bg-warning/10 text-warning",
  AUTHENTICATION: "bg-primary/10 text-primary",
};

export default function Dashboard() {
  return (
    <AppLayout title="لوحة التحكم" subtitle="نظرة عامة — Mohamed Azab Business">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.title} className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{stat.title}</p>
                    <p className="text-2xl font-bold mt-1">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
                  </div>
                  <div className={`p-3 rounded-xl bg-muted ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Active WABA Accounts */}
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                حسابات WABA النشطة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {wabaAccounts.map((account) => (
                <div key={account.wabaId} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{account.name}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{account.phone}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{account.templates} قالب</span>
                    <Badge variant="default" className="text-xs">{account.status}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Recent Templates */}
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-info" />
                أحدث القوالب
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentTemplates.map((tmpl) => (
                <div key={tmpl.name + tmpl.waba} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex-1">
                    <p className="text-sm font-medium font-mono" dir="ltr">{tmpl.name}</p>
                    <p className="text-xs text-muted-foreground">{tmpl.waba}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${categoryColors[tmpl.category]}`}>
                      {tmpl.category === "UTILITY" ? "خدمي" : tmpl.category === "MARKETING" ? "تسويقي" : "مصادقة"}
                    </span>
                    <Badge variant="default" className="text-[10px]">{tmpl.language}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Maintenance */}
          <Card className="shadow-card lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Wrench className="h-4 w-4 text-warning" />
                آخر طلبات الصيانة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {recentMaintenance.map((req) => (
                  <div key={req.title} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{req.title}</p>
                      <p className="text-xs text-muted-foreground">{req.building}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={priorityMap[req.priority]} className="text-xs">{req.priority}</Badge>
                      <span className="text-[10px] text-muted-foreground">{req.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
