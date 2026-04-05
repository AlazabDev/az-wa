import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, FileText, GitBranch, MessageCircle, TrendingUp, Clock } from "lucide-react";

const stats = [
  { label: "الحسابات النشطة", value: "4", icon: Users, change: "+1 هذا الشهر" },
  { label: "القوالب المعتمدة", value: "12", icon: FileText, change: "3 قيد المراجعة" },
  { label: "التدفقات النشطة", value: "8", icon: GitBranch, change: "2 متوقفة" },
  { label: "الرسائل المرسلة", value: "24.5K", icon: MessageCircle, change: "+12% هذا الأسبوع" },
];

const recentTemplates = [
  { name: "ترحيب العملاء الجدد", status: "approved", account: "متجر الإلكترونيات", date: "قبل ساعتين" },
  { name: "تأكيد الطلب", status: "pending", account: "مطعم السعادة", date: "قبل 5 ساعات" },
  { name: "عرض خاص رمضان", status: "rejected", account: "متجر الأزياء", date: "أمس" },
  { name: "تذكير بالموعد", status: "approved", account: "عيادة الصحة", date: "قبل يومين" },
];

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  approved: { label: "معتمد", variant: "default" },
  pending: { label: "قيد المراجعة", variant: "secondary" },
  rejected: { label: "مرفوض", variant: "destructive" },
};

export default function Dashboard() {
  return (
    <AppLayout title="لوحة التحكم" subtitle="نظرة عامة على حساباتك وقوالبك">
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="shadow-card hover:shadow-card-hover transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold mt-1">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-success" />
                      {stat.change}
                    </p>
                  </div>
                  <div className="rounded-lg bg-accent p-2.5">
                    <stat.icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Templates */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              آخر القوالب
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentTemplates.map((template, i) => {
                const status = statusMap[template.status];
                return (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{template.name}</p>
                        <p className="text-xs text-muted-foreground">{template.account}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <span className="text-xs text-muted-foreground">{template.date}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
