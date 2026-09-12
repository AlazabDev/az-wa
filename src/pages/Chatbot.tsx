import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import {
  Bot,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Zap,
  MessageSquare,
  Users,
  Megaphone,
} from "lucide-react";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/use-tenant";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatbotRule {
  id: string;
  tenant_id: string;
  wa_number_id: string | null;
  trigger_type: "keyword" | "regex" | "any" | "first_message";
  trigger_value: string | null;
  response_type: "text" | "template" | "human_takeover" | "ai_reply";
  response_text: string | null;
  template_name: string | null;
  template_language: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
}

interface WaNumber {
  id: string;
  phone_e164: string;
  phone_number_id: string;
}

interface Template {
  id: string;
  name: string;
  language: string;
  status: string;
}

const EMPTY_RULE: Omit<ChatbotRule, "id" | "tenant_id" | "created_at"> = {
  wa_number_id: null,
  trigger_type: "keyword",
  trigger_value: "",
  response_type: "text",
  response_text: "",
  template_name: null,
  template_language: "ar",
  priority: 0,
  is_active: true,
};

// ─── Badge helpers ─────────────────────────────────────────────────────────────

const triggerLabels: Record<string, { label: string; color: string }> = {
  keyword: {
    label: "كلمة مفتاحية",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  },
  regex: {
    label: "نمط Regex",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  },
  any: {
    label: "أي رسالة",
    color: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  },
  first_message: {
    label: "أول رسالة",
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
};

const responseLabels: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  text: {
    label: "رد نصي",
    color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    icon: MessageSquare,
  },
  template: {
    label: "قالب",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    icon: Megaphone,
  },
  human_takeover: {
    label: "تحويل إنسان",
    color: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    icon: Users,
  },
  ai_reply: {
    label: "رد بالذكاء",
    color: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
    icon: Zap,
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

const ChatbotPage = () => {
  const { tenantId, loading: tenantLoading } = useTenant();
  const { toast } = useToast();

  const [rules, setRules] = useState<ChatbotRule[]>([]);
  const [waNumbers, setWaNumbers] = useState<WaNumber[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ChatbotRule | null>(null);
  const [form, setForm] = useState(EMPTY_RULE);
  const [saving, setSaving] = useState(false);

  // Stats
  const activeCount = rules.filter((r) => r.is_active).length;
  const aiCount = rules.filter((r) => r.response_type === "ai_reply").length;

  // ── Fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!tenantId) return;
    fetchAll();
  }, [tenantId]);

  async function fetchAll() {
    setLoading(true);
    const [{ data: r }, { data: n }, { data: t }] = await Promise.all([
      supabase
        .from("chatbot_rules")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("priority", { ascending: false }),
      supabase
        .from("wa_numbers")
        .select("id, phone_e164, phone_number_id")
        .eq("tenant_id", tenantId!),
      supabase
        .from("templates")
        .select("id, name, language, status")
        .eq("tenant_id", tenantId!)
        .eq("status", "APPROVED"),
    ]);
    setRules((r as ChatbotRule[]) ?? []);
    setWaNumbers((n as WaNumber[]) ?? []);
    setTemplates((t as Template[]) ?? []);
    setLoading(false);
  }

  // ── Dialog ─────────────────────────────────────────────────────────────────

  function openCreate() {
    setEditingRule(null);
    setForm({ ...EMPTY_RULE });
    setDialogOpen(true);
  }

  function openEdit(rule: ChatbotRule) {
    setEditingRule(rule);
    setForm({
      wa_number_id: rule.wa_number_id,
      trigger_type: rule.trigger_type,
      trigger_value: rule.trigger_value ?? "",
      response_type: rule.response_type,
      response_text: rule.response_text ?? "",
      template_name: rule.template_name,
      template_language: rule.template_language ?? "ar",
      priority: rule.priority,
      is_active: rule.is_active,
    });
    setDialogOpen(true);
  }

  async function saveRule() {
    if (!tenantId) return;
    setSaving(true);

    const payload = {
      tenant_id: tenantId,
      wa_number_id: form.wa_number_id || null,
      trigger_type: form.trigger_type,
      trigger_value: ["any", "first_message"].includes(form.trigger_type)
        ? null
        : form.trigger_value || null,
      response_type: form.response_type,
      response_text: form.response_type === "text" ? form.response_text || null : null,
      template_name: form.response_type === "template" ? form.template_name || null : null,
      template_language: form.template_language || "ar",
      priority: form.priority,
      is_active: form.is_active,
    };

    const { error } = editingRule
      ? await supabase.from("chatbot_rules").update(payload).eq("id", editingRule.id)
      : await supabase.from("chatbot_rules").insert(payload);

    setSaving(false);
    if (error) {
      toast({ title: "خطأ في الحفظ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingRule ? "✅ تم التحديث" : "✅ تمت الإضافة" });
    setDialogOpen(false);
    fetchAll();
  }

  async function deleteRule(id: string) {
    const { error } = await supabase.from("chatbot_rules").delete().eq("id", id);
    if (error) {
      toast({ title: "خطأ في الحذف", description: error.message, variant: "destructive" });
      return;
    }
    setRules((prev) => prev.filter((r) => r.id !== id));
    toast({ title: "تم الحذف" });
  }

  async function toggleActive(rule: ChatbotRule) {
    const { error } = await supabase
      .from("chatbot_rules")
      .update({ is_active: !rule.is_active })
      .eq("id", rule.id);
    if (!error)
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, is_active: !r.is_active } : r)),
      );
  }

  async function changePriority(rule: ChatbotRule, delta: number) {
    const newPriority = Math.max(0, rule.priority + delta);
    const { error } = await supabase
      .from("chatbot_rules")
      .update({ priority: newPriority })
      .eq("id", rule.id);
    if (!error) {
      setRules((prev) =>
        prev
          .map((r) => (r.id === rule.id ? { ...r, priority: newPriority } : r))
          .sort((a, b) => b.priority - a.priority),
      );
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (tenantLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="الشات بوت الذكي"
        description="إدارة قواعد الرد التلقائي والذكاء الاصطناعي"
        action={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            قاعدة جديدة
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "قواعد نشطة", value: activeCount, color: "text-emerald-600" },
          { label: "إجمالي القواعد", value: rules.length, color: "text-blue-600" },
          { label: "ردود بالذكاء", value: aiCount, color: "text-violet-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border bg-card p-4 text-center">
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            <p className="text-sm text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="لا توجد قواعد بعد"
          description="أضف قاعدة للرد التلقائي على رسائل العملاء"
          action={
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 ml-1" />
              إضافة قاعدة
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {rules.map((rule, idx) => {
            const trig = triggerLabels[rule.trigger_type] ?? {
              label: rule.trigger_type,
              color: "bg-gray-100",
            };
            const resp = responseLabels[rule.response_type] ?? {
              label: rule.response_type,
              color: "bg-gray-100",
              icon: MessageSquare,
            };
            const RespIcon = resp.icon;
            return (
              <div
                key={rule.id}
                className={`flex items-center gap-3 rounded-xl border bg-card p-4 transition-opacity ${
                  rule.is_active ? "" : "opacity-50"
                }`}
              >
                {/* Priority controls */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => changePriority(rule, 1)}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs text-center text-muted-foreground font-mono">
                    {rule.priority}
                  </span>
                  <button
                    onClick={() => changePriority(rule, -1)}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Trigger */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${trig.color}`}>
                      {trig.label}
                    </span>
                    {rule.trigger_value && (
                      <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono truncate max-w-[200px]">
                        {rule.trigger_value}
                      </code>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <RespIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${resp.color}`}>
                      {resp.label}
                    </span>
                    {rule.response_text && (
                      <span className="text-xs text-muted-foreground truncate max-w-[240px]">
                        {rule.response_text}
                      </span>
                    )}
                    {rule.template_name && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {rule.template_name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Number badge */}
                {rule.wa_number_id && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {waNumbers.find((n) => n.id === rule.wa_number_id)?.phone_e164 ?? "رقم محدد"}
                  </span>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleActive(rule)}
                    className="p-1.5 rounded hover:bg-muted"
                  >
                    {rule.is_active ? (
                      <ToggleRight className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    onClick={() => openEdit(rule)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteRule(rule.id)}
                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Dialog ── */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) setDialogOpen(false);
        }}
      >
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingRule ? "تعديل القاعدة" : "قاعدة رد تلقائي جديدة"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Number (optional) */}
            <div className="space-y-1.5">
              <Label>رقم واتساب (اختياري — فارغ = كل الأرقام)</Label>
              <Select
                value={form.wa_number_id ?? "all"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, wa_number_id: v === "all" ? null : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="كل الأرقام" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأرقام</SelectItem>
                  {waNumbers.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.phone_e164}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Trigger type */}
            <div className="space-y-1.5">
              <Label>نوع المُشغِّل</Label>
              <Select
                value={form.trigger_type}
                onValueChange={(v: typeof form.trigger_type) =>
                  setForm((f) => ({ ...f, trigger_type: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">كلمة مفتاحية (مثل: مرحبا,هلا)</SelectItem>
                  <SelectItem value="regex">نمط Regex</SelectItem>
                  <SelectItem value="first_message">أول رسالة في المحادثة</SelectItem>
                  <SelectItem value="any">أي رسالة (fallback)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Trigger value */}
            {!["any", "first_message"].includes(form.trigger_type) && (
              <div className="space-y-1.5">
                <Label>
                  {form.trigger_type === "keyword"
                    ? "الكلمات المفتاحية (مفصولة بفاصلة)"
                    : "نمط Regex"}
                </Label>
                <Input
                  value={form.trigger_value ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, trigger_value: e.target.value }))}
                  placeholder={
                    form.trigger_type === "keyword" ? "مرحبا,هلا,السلام عليكم" : "^(مرحب|أهلا)"
                  }
                  dir="rtl"
                />
              </div>
            )}

            {/* Response type */}
            <div className="space-y-1.5">
              <Label>نوع الرد</Label>
              <Select
                value={form.response_type}
                onValueChange={(v: typeof form.response_type) =>
                  setForm((f) => ({ ...f, response_type: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">رد نصي مباشر</SelectItem>
                  <SelectItem value="ai_reply">رد بالذكاء الاصطناعي (Claude)</SelectItem>
                  <SelectItem value="template">إرسال قالب</SelectItem>
                  <SelectItem value="human_takeover">تحويل لموظف بشري</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Response text */}
            {["text", "human_takeover"].includes(form.response_type) && (
              <div className="space-y-1.5">
                <Label>
                  {form.response_type === "human_takeover"
                    ? "رسالة قبل التحويل (اختياري)"
                    : "نص الرد"}
                </Label>
                <Textarea
                  value={form.response_text ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, response_text: e.target.value }))}
                  rows={3}
                  dir="rtl"
                  placeholder="مرحباً! كيف يمكنني مساعدتك؟"
                />
              </div>
            )}

            {/* Template */}
            {form.response_type === "template" && (
              <div className="space-y-1.5">
                <Label>القالب</Label>
                <Select
                  value={form.template_name ?? ""}
                  onValueChange={(v) => setForm((f) => ({ ...f, template_name: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر قالباً" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.name}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Priority + Active */}
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-1.5">
                <Label>الأولوية (كلما ارتفعت نُطبِّق أولاً)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.priority}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, priority: parseInt(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                />
                <Label>{form.is_active ? "مفعّلة" : "معطّلة"}</Label>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={saveRule} disabled={saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin ml-2" />
              ) : (
                <Check className="w-4 h-4 ml-2" />
              )}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default ChatbotPage;
