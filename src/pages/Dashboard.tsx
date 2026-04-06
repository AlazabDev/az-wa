import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, Users, Wrench, HardHat } from "lucide-react";

const stats = [
  { title: "المشاريع النشطة", value: "12", icon: FolderKanban, change: "+3 هذا الشهر", color: "text-primary" },
  { title: "العملاء", value: "48", icon: Users, change: "+5 جدد", color: "text-info" },
  { title: "طلبات الصيانة", value: "23", icon: Wrench, change: "8 قيد التنفيذ", color: "text-warning" },
  { title: "العمال والفنيين", value: "36", icon: HardHat, change: "32 متاحين", color: "text-success" },
];

const recentProjects = [
  { name: "برج السلام السكني", client: "شركة الأفق", status: "قيد التنفيذ", progress: 65 },
  { name: "صيانة مجمع النور", client: "مؤسسة النور", status: "قيد التنفيذ", progress: 40 },
  { name: "ترميم فيلا الياسمين", client: "أحمد العلي", status: "مكتمل", progress: 100 },
  { name: "بناء مستودعات صناعية", client: "شركة الصناعات", status: "تخطيط", progress: 10 },
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

const statusMap: Record<string, "default" | "secondary" | "outline"> = {
  "قيد التنفيذ": "default",
  "مكتمل": "secondary",
  "تخطيط": "outline",
};

export default function Dashboard() {
  return (
    <AppLayout title="لوحة التحكم" subtitle="نظرة عامة على المشاريع والصيانة">
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
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-primary" />
                أحدث المشاريع
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentProjects.map((project) => (
                <div key={project.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{project.name}</p>
                    <p className="text-xs text-muted-foreground">{project.client}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-20">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${project.progress}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 text-center">{project.progress}%</p>
                    </div>
                    <Badge variant={statusMap[project.status]} className="text-xs">{project.status}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Wrench className="h-4 w-4 text-warning" />
                آخر طلبات الصيانة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentMaintenance.map((req) => (
                <div key={req.title} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{req.title}</p>
                    <p className="text-xs text-muted-foreground">{req.building}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{req.time}</span>
                    <Badge variant={priorityMap[req.priority]} className="text-xs">{req.priority}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}