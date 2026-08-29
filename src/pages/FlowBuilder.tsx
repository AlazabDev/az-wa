import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  MessageSquare,
  Clock,
  GitBranch,
  CheckCircle2,
  Bell,
  Mail,
  Users,
  FileText,
  Settings,
  ChevronDown,
  ChevronUp,
  Save,
  Play,
  Zap,
  Filter,
  ArrowDown,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

type TriggerType = "event" | "schedule" | "manual";
type ActionType = "send_message" | "send_template" | "assign_team" | "update_status" | "wait" | "condition" | "notify" | "create_task";

interface FlowStep {
  id: string;
  type: ActionType;
  title: string;
  config: Record<string, string>;
  expanded: boolean;
}

const triggerOptions: { value: TriggerType; label: string; icon: typeof Zap; description: string }[] = [
  { value: "event", label: "حدث معين", icon: Zap, description: "عند حدوث إجراء مثل طلب صيانة جديد أو تحديث مشروع" },
  { value: "schedule", label: "جدول زمني", icon: Clock, description: "تشغيل تلقائي في وقت محدد (يومي، أسبوعي، شهري)" },
  { value: "manual", label: "تشغيل يدوي", icon: Play, description: "يتم تشغيله يدوياً من قبل المستخدم" },
];

const eventOptions = [
  { value: "new_maintenance", label: "طلب صيانة جديد" },
  { value: "project_update", label: "تحديث حالة مشروع" },
  { value: "new_client", label: "إضافة عميل جديد" },
  { value: "stage_complete", label: "اكتمال مرحلة" },
  { value: "payment_received", label: "استلام دفعة" },
  { value: "inspection_due", label: "موعد فحص قريب" },
];

const scheduleOptions = [
  { value: "daily_9am", label: "يومياً - 9 صباحاً" },
  { value: "daily_6pm", label: "يومياً - 6 مساءً" },
  { value: "weekly_sun", label: "أسبوعياً - كل أحد" },
  { value: "weekly_thu", label: "أسبوعياً - كل خميس" },
  { value: "monthly_1", label: "شهرياً - أول الشهر" },
  { value: "monthly_15", label: "شهرياً - منتصف الشهر" },
];

const actionTypes: { value: ActionType; label: string; icon: typeof MessageSquare; color: string }[] = [
  { value: "send_message", label: "إرسال رسالة", icon: MessageSquare, color: "text-blue-500" },
  { value: "send_template", label: "إرسال قالب", icon: FileText, color: "text-green-500" },
  { value: "assign_team", label: "تعيين فريق", icon: Users, color: "text-purple-500" },
  { value: "update_status", label: "تحديث الحالة", icon: Settings, color: "text-orange-500" },
  { value: "wait", label: "انتظار", icon: Clock, color: "text-yellow-500" },
  { value: "condition", label: "شرط", icon: Filter, color: "text-red-500" },
  { value: "notify", label: "إشعار داخلي", icon: Bell, color: "text-indigo-500" },
  { value: "create_task", label: "إنشاء مهمة", icon: CheckCircle2, color: "text-teal-500" },
];

const generateId = () => Math.random().toString(36).substring(2, 9);

export default function FlowBuilder() {
  const navigate = useNavigate();
  const [flowName, setFlowName] = useState("");
  const [flowDescription, setFlowDescription] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType | "">("");
  const [triggerEvent, setTriggerEvent] = useState("");
  const [triggerSchedule, setTriggerSchedule] = useState("");
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [showActionPicker, setShowActionPicker] = useState(false);

  const addStep = (type: ActionType) => {
    const actionInfo = actionTypes.find((a) => a.value === type)!;
    setSteps([
      ...steps,
      {
        id: generateId(),
        type,
        title: actionInfo.label,
        config: {},
        expanded: true,
      },
    ]);
    setShowActionPicker(false);
  };

  const removeStep = (id: string) => {
    setSteps(steps.filter((s) => s.id !== id));
  };

  const toggleExpand = (id: string) => {
    setSteps(steps.map((s) => (s.id === id ? { ...s, expanded: !s.expanded } : s)));
  };

  const updateStepConfig = (id: string, key: string, value: string) => {
    setSteps(steps.map((s) => (s.id === id ? { ...s, config: { ...s.config, [key]: value } } : s)));
  };

  const updateStepTitle = (id: string, title: string) => {
    setSteps(steps.map((s) => (s.id === id ? { ...s, title } : s)));
  };

  const moveStep = (index: number, direction: "up" | "down") => {
    const newSteps = [...steps];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSteps.length) return;
    const currentStep = newSteps[index];
    const targetStep = newSteps[targetIndex];
    if (!currentStep || !targetStep) return;
    newSteps[index] = targetStep;
    newSteps[targetIndex] = currentStep;
    setSteps(newSteps);
  };

  const handleSave = (asDraft: boolean) => {
    if (!flowName.trim()) {
      toast.error("يرجى إدخال اسم التدفق");
      return;
    }
    if (!triggerType) {
      toast.error("يرجى اختيار نوع المحفز");
      return;
    }
    if (steps.length === 0) {
      toast.error("يرجى إضافة خطوة واحدة على الأقل");
      return;
    }
    toast.success(asDraft ? "تم حفظ المسودة بنجاح" : "تم حفظ وتفعيل التدفق بنجاح");
    navigate({ to: "/legacy/flows" });
  };

  const renderStepConfig = (step: FlowStep) => {
    switch (step.type) {
      case "send_message":
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">المستلم</Label>
              <Select value={step.config["recipient"] || ""} onValueChange={(v) => updateStepConfig(step.id, "recipient", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="اختر المستلم" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">العميل</SelectItem>
                  <SelectItem value="team_lead">قائد الفريق</SelectItem>
                  <SelectItem value="manager">مدير المشروع</SelectItem>
                  <SelectItem value="all_team">كل أعضاء الفريق</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">نص الرسالة</Label>
              <Textarea className="mt-1 text-sm" rows={3} placeholder="اكتب نص الرسالة... يمكنك استخدام {{اسم_العميل}} {{رقم_الطلب}}" value={step.config["message"] || ""} onChange={(e) => updateStepConfig(step.id, "message", e.target.value)} />
            </div>
          </div>
        );
      case "send_template":
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">القالب</Label>
              <Select value={step.config["template"] || ""} onValueChange={(v) => updateStepConfig(step.id, "template", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="اختر القالب" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="maintenance_confirm">تأكيد موعد صيانة</SelectItem>
                  <SelectItem value="project_update">تحديث تقدم المشروع</SelectItem>
                  <SelectItem value="welcome">رسالة ترحيب</SelectItem>
                  <SelectItem value="invoice">إرسال فاتورة</SelectItem>
                  <SelectItem value="completion">إشعار اكتمال العمل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">المستلم</Label>
              <Select value={step.config["recipient"] || ""} onValueChange={(v) => updateStepConfig(step.id, "recipient", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="اختر المستلم" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">العميل</SelectItem>
                  <SelectItem value="team_lead">قائد الفريق</SelectItem>
                  <SelectItem value="manager">مدير المشروع</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case "assign_team":
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">الفريق</Label>
              <Select value={step.config["team"] || ""} onValueChange={(v) => updateStepConfig(step.id, "team", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الفريق" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="plumbing">فريق السباكة</SelectItem>
                  <SelectItem value="electrical">فريق الكهرباء</SelectItem>
                  <SelectItem value="painting">فريق الدهانات</SelectItem>
                  <SelectItem value="general">الصيانة العامة</SelectItem>
                  <SelectItem value="ac">فريق التكييف</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">ملاحظات التعيين</Label>
              <Input className="mt-1 text-sm" placeholder="ملاحظات إضافية للفريق..." value={step.config["notes"] || ""} onChange={(e) => updateStepConfig(step.id, "notes", e.target.value)} />
            </div>
          </div>
        );
      case "update_status":
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">الكيان</Label>
              <Select value={step.config["entity"] || ""} onValueChange={(v) => updateStepConfig(step.id, "entity", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الكيان" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="maintenance">طلب الصيانة</SelectItem>
                  <SelectItem value="project">المشروع</SelectItem>
                  <SelectItem value="stage">المرحلة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">الحالة الجديدة</Label>
              <Select value={step.config["status"] || ""} onValueChange={(v) => updateStepConfig(step.id, "status", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الحالة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
                  <SelectItem value="pending_approval">بانتظار الموافقة</SelectItem>
                  <SelectItem value="completed">مكتمل</SelectItem>
                  <SelectItem value="on_hold">معلّق</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case "wait":
        return (
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-xs">المدة</Label>
                <Input className="mt-1 text-sm" type="number" min={1} placeholder="المدة" value={step.config["duration"] || ""} onChange={(e) => updateStepConfig(step.id, "duration", e.target.value)} />
              </div>
              <div className="flex-1">
                <Label className="text-xs">الوحدة</Label>
                <Select value={step.config["unit"] || ""} onValueChange={(v) => updateStepConfig(step.id, "unit", v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="وحدة" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">دقائق</SelectItem>
                    <SelectItem value="hours">ساعات</SelectItem>
                    <SelectItem value="days">أيام</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );
      case "condition":
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">الشرط</Label>
              <Select value={step.config["field"] || ""} onValueChange={(v) => updateStepConfig(step.id, "field", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الحقل" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="priority">الأولوية</SelectItem>
                  <SelectItem value="type">نوع الطلب</SelectItem>
                  <SelectItem value="client_type">نوع العميل</SelectItem>
                  <SelectItem value="amount">المبلغ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">القيمة</Label>
              <Input className="mt-1 text-sm" placeholder="القيمة المطلوبة..." value={step.config["value"] || ""} onChange={(e) => updateStepConfig(step.id, "value", e.target.value)} />
            </div>
          </div>
        );
      case "notify":
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">المستلم</Label>
              <Select value={step.config["recipient"] || ""} onValueChange={(v) => updateStepConfig(step.id, "recipient", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="من يتلقى الإشعار" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">المدير العام</SelectItem>
                  <SelectItem value="project_manager">مدير المشروع</SelectItem>
                  <SelectItem value="team_lead">قائد الفريق</SelectItem>
                  <SelectItem value="accounting">المحاسبة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">نص الإشعار</Label>
              <Input className="mt-1 text-sm" placeholder="نص الإشعار..." value={step.config["message"] || ""} onChange={(e) => updateStepConfig(step.id, "message", e.target.value)} />
            </div>
          </div>
        );
      case "create_task":
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">عنوان المهمة</Label>
              <Input className="mt-1 text-sm" placeholder="عنوان المهمة..." value={step.config["task_title"] || ""} onChange={(e) => updateStepConfig(step.id, "task_title", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">تعيين إلى</Label>
              <Select value={step.config["assignee"] || ""} onValueChange={(v) => updateStepConfig(step.id, "assignee", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="تعيين المهمة إلى" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="team_lead">قائد الفريق</SelectItem>
                  <SelectItem value="project_manager">مدير المشروع</SelectItem>
                  <SelectItem value="auto">تعيين تلقائي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">الأولوية</Label>
              <Select value={step.config["priority"] || ""} onValueChange={(v) => updateStepConfig(step.id, "priority", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="الأولوية" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">عاجل</SelectItem>
                  <SelectItem value="medium">متوسط</SelectItem>
                  <SelectItem value="low">عادي</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <AppLayout
      title="إنشاء تدفق جديد"
      subtitle="بناء سير عمل مؤتمت للمقاولات والصيانة"
      actions={
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/legacy/flows" })}>
          <ArrowLeft className="h-4 w-4 ml-1" />
          رجوع
        </Button>
      }
    >
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              معلومات التدفق
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm">اسم التدفق</Label>
              <Input className="mt-1" placeholder="مثال: تدفق طلب صيانة جديد" value={flowName} onChange={(e) => setFlowName(e.target.value)} />
            </div>
            <div>
              <Label className="text-sm">الوصف (اختياري)</Label>
              <Textarea className="mt-1" rows={2} placeholder="وصف مختصر لما يفعله هذا التدفق..." value={flowDescription} onChange={(e) => setFlowDescription(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Trigger */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              المحفز (Trigger)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {triggerOptions.map((trigger) => {
                const Icon = trigger.icon;
                const isSelected = triggerType === trigger.value;
                return (
                  <button
                    key={trigger.value}
                    onClick={() => { setTriggerType(trigger.value); setTriggerEvent(""); setTriggerSchedule(""); }}
                    className={`p-3 rounded-lg border-2 text-right transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/50"
                    }`}
                  >
                    <Icon className={`h-5 w-5 mb-2 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="text-sm font-medium">{trigger.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{trigger.description}</p>
                  </button>
                );
              })}
            </div>

            {triggerType === "event" && (
              <div>
                <Label className="text-sm">الحدث</Label>
                <Select value={triggerEvent} onValueChange={setTriggerEvent}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الحدث المحفز" /></SelectTrigger>
                  <SelectContent>
                    {eventOptions.map((e) => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {triggerType === "schedule" && (
              <div>
                <Label className="text-sm">الجدول الزمني</Label>
                <Select value={triggerSchedule} onValueChange={setTriggerSchedule}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="اختر التوقيت" /></SelectTrigger>
                  <SelectContent>
                    {scheduleOptions.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Steps */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                خطوات التدفق ({steps.length})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {steps.length === 0 && !showActionPicker && (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">لا توجد خطوات بعد</p>
                <p className="text-xs mt-1">ابدأ بإضافة خطوات لبناء سير العمل</p>
              </div>
            )}

            {steps.map((step, index) => {
              const actionInfo = actionTypes.find((a) => a.value === step.type)!;
              const StepIcon = actionInfo.icon;
              return (
                <div key={step.id}>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 p-3 bg-muted/30">
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveStep(index, "up")} disabled={index === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button onClick={() => moveStep(index, "down")} disabled={index === steps.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                      <Badge variant="outline" className="text-xs w-6 h-6 flex items-center justify-center p-0 rounded-full">
                        {index + 1}
                      </Badge>
                      <StepIcon className={`h-4 w-4 ${actionInfo.color}`} />
                      <Input
                        className="flex-1 h-7 text-sm font-medium border-none bg-transparent shadow-none focus-visible:ring-0 p-0"
                        value={step.title}
                        onChange={(e) => updateStepTitle(step.id, e.target.value)}
                      />
                      <Badge variant="secondary" className="text-xs">{actionInfo.label}</Badge>
                      <button onClick={() => toggleExpand(step.id)} className="text-muted-foreground hover:text-foreground">
                        {step.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      <button onClick={() => removeStep(step.id)} className="text-destructive/60 hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {step.expanded && (
                      <div className="p-3 border-t">
                        {renderStepConfig(step)}
                      </div>
                    )}
                  </div>
                  {index < steps.length - 1 && (
                    <div className="flex justify-center py-1">
                      <ArrowDown className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Action Picker */}
            {showActionPicker ? (
              <div className="border-2 border-dashed border-primary/30 rounded-lg p-4">
                <p className="text-sm font-medium mb-3">اختر نوع الخطوة:</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {actionTypes.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.value}
                        onClick={() => addStep(action.value)}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-lg border hover:border-primary/40 hover:bg-muted/50 transition-all text-center"
                      >
                        <Icon className={`h-5 w-5 ${action.color}`} />
                        <span className="text-xs font-medium">{action.label}</span>
                      </button>
                    );
                  })}
                </div>
                <Button variant="ghost" size="sm" className="mt-3 w-full text-xs" onClick={() => setShowActionPicker(false)}>
                  إلغاء
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="w-full border-dashed" onClick={() => setShowActionPicker(true)}>
                <Plus className="h-4 w-4 ml-1" />
                إضافة خطوة
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 justify-end pb-6">
          <Button variant="outline" onClick={() => navigate({ to: "/legacy/flows" })}>إلغاء</Button>
          <Button variant="secondary" onClick={() => handleSave(true)}>
            <Save className="h-4 w-4 ml-1" />
            حفظ كمسودة
          </Button>
          <Button className="gradient-primary text-primary-foreground" onClick={() => handleSave(false)}>
            <Play className="h-4 w-4 ml-1" />
            حفظ وتفعيل
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
