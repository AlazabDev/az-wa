import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, GitBranch, Play, Pause, Copy, Trash2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const flows = [
  { id: 1, name: "تدفق طلب صيانة جديد", status: "active", triggers: "عند استلام طلب صيانة", steps: 5, description: "إشعار العميل ← تعيين فريق ← جدولة الموعد ← تأكيد ← متابعة" },
  { id: 2, name: "تقرير تقدم مشروع أسبوعي", status: "active", triggers: "كل يوم أحد 9 صباحاً", steps: 3, description: "جمع البيانات ← إنشاء التقرير ← إرسال للعميل" },
  { id: 3, name: "تذكير بموعد صيانة دورية", status: "paused", triggers: "قبل 48 ساعة من الموعد", steps: 4, description: "تذكير العميل ← تأكيد الفريق ← إرسال التفاصيل ← متابعة" },
  { id: 4, name: "إشعار اكتمال مرحلة", status: "active", triggers: "عند تحديث حالة المرحلة", steps: 3, description: "إشعار المدير ← إشعار العميل ← طلب موافقة" },
  { id: 5, name: "ترحيب عميل جديد", status: "draft", triggers: "عند إضافة عميل جديد", steps: 4, description: "رسالة ترحيب ← إرسال دليل الخدمات ← جدولة اجتماع ← متابعة" },
];

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline"; icon: typeof Play }> = {
  active: { label: "نشط", variant: "default", icon: Play },
  paused: { label: "متوقف", variant: "secondary", icon: Pause },
  draft: { label: "مسودة", variant: "outline", icon: GitBranch },
};

export default function Flows() {
  const navigate = useNavigate();
  return (
    <AppLayout
      title="التدفقات"
      subtitle="أتمتة مراسلات المقاولات والصيانة"
      actions={
        <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => navigate("/flows/new")}>
          <Plus className="h-4 w-4 ml-1" />
          تدفق جديد
        </Button>
      }
    >
      <div className="space-y-4">
        {flows.map((flow) => {
          const status = statusMap[flow.status];
          const StatusIcon = status.icon;
          return (
            <Card key={flow.id} className="shadow-card hover:shadow-card-hover transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold">{flow.name}</h3>
                      <Badge variant={status.variant} className="text-xs flex items-center gap-1">
                        <StatusIcon className="h-3 w-3" />{status.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">المحفز: {flow.triggers}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-2 flex-wrap">
                      {flow.description.split(" ← ").map((step, i, arr) => (
                        <span key={i} className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-primary" />
                          {step}
                          {i < arr.length - 1 && <ArrowLeft className="h-3 w-3 text-muted-foreground" />}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{flow.steps} خطوات</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="text-xs">تعديل</Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8"><Copy className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppLayout>
  );
}