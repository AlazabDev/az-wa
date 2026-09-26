import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import {
  Megaphone,
  Plus,
  Loader2,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Send,
  ChevronDown,
  ChevronUp,
  BarChart2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/use-tenant";
import { useToast } from "@/hooks/use-toast";
import { useDirectApi } from "@/hooks/use-api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Broadcast {
  id: string;
  name: string | null;
  template_name: string;
  template_language: string;
  status: "pending" | "running" | "completed" | "failed" | "paused";
  total_count: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  wa_number_id: string;
  phone_number_id: string;
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
  category: string;
}

// ─── Status helpers ────────────────────────────────────────────────────────────

const statusConfig: Record<
  string,
  {
    label: string;
    icon: React.ElementType;
    color: string;
    badge: string;
  }
> = {
  pending: {
    label: "في الانتظار",
    icon: Clock,
    color: "text-amber-500",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  },
  running: {
    label: "جارٍ الإرسال",
    icon: Loader2,
    color: "text-blue-500",
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  },
  completed: {
    label: "مكتملة",
    icon: CheckCircle2,
    color: "text-green-500",
    badge: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  },
  failed: {
    label: "فشلت",
    icon: XCircle,
    color: "text-red-500",
    badge: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  },
  paused: {
    label: "متوقفة",
    icon: Pause,
    color: "text-gray-500",
    badge: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  },
};

// ─── BroadcastCard ────────────────────────────────────────────────────────────

function BroadcastCard({ bc, onRefresh }: { bc: Broadcast; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = statusConfig[bc.status] ?? statusConfig.pending;
  const StatusIcon = cfg.icon;

  const pct = bc.total_count > 0 ? Math.round((bc.sent_count / bc.total_count) * 100) : 0;
  const delivPct = bc.sent_count > 0 ? Math.round((bc.delivered_count / bc.sent_count) * 100) : 0;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-4 p-4">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-muted shrink-0`}>
          <Megaphone className="w-5 h-5 text-primary" />
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm">{bc.name ?? bc.template_name}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-muted-foreground font-mono">{bc.template_name}</span>
            {bc.started_at && (
              <span className="text-xs text-muted-foreground">
                {new Date(bc.started_at).toLocaleDateString("ar")}
              </span>
            )}
          </div>
        </div>

        {/* Counts */}
        <div className="hidden sm:flex items-center gap-4 text-center shrink-0">
          {[
            { label: "إجمالي", value: bc.total_count, color: "text-foreground" },
            { label: "أُرسل", value: bc.sent_count, color: "text-blue-600" },
            { label: "وصل", value: bc.delivered_count, color: "text-green-600" },
            { label: "فشل", value: bc.failed_count, color: "text-red-600" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p className={`text-base font-bold ${color}`}>{value.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Expand */}
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
      </div>

      {/* Progress bar */}
      {bc.status === "running" && (
        <div className="px-4 pb-3">
          <Progress value={pct} className="h-1.5" />
          <p className="text-xs text-muted-foreground mt-1 text-left">{pct}% مُرسَل</p>
        </div>
      )}

      {/* Expanded stats */}
      {expanded && (
        <div className="border-t px-4 py-3 bg-muted/30">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">نسبة الإرسال</p>
              <Progress value={pct} className="h-2 mt-1" />
              <p className="text-xs mt-0.5">{pct}%</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">نسبة التوصيل</p>
              <Progress value={delivPct} className="h-2 mt-1" />
              <p className="text-xs mt-0.5">{delivPct}%</p>
            </div>
            {bc.completed_at && (
              <div className="col-span-2 text-xs text-muted-foreground">
                انتهت: {new Date(bc.completed_at).toLocaleString("ar")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

const BroadcastsPage = () => {
  const { tenantId, loading: tenantLoading } = useTenant();
  const { toast } = useToast();
  const api = useDirectApi();

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [waNumbers, setWaNumbers] = useState<WaNumber[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    name: "",
    waNumberId: "",
    phoneNumberId: "",
    templateName: "",
    templateLanguage: "ar",
    targetAll: true,
    maxCount: "",
    delayMs: "100",
  });

  // Stats
  const totalSent = broadcasts.reduce((s, b) => s + b.sent_count, 0);
  const totalDelivered = broadcasts.reduce((s, b) => s + b.delivered_count, 0);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(
    async (silent = false) => {
      if (!tenantId) return;
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const [{ data: b }, { data: n }, { data: t }] = await Promise.all([
        supabase
          .from("broadcasts")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("wa_numbers")
          .select("id, phone_e164, phone_number_id")
          .eq("tenant_id", tenantId),
        supabase
          .from("templates")
          .select("id, name, language, status, category")
          .eq("tenant_id", tenantId)
          .eq("status", "APPROVED"),
      ]);

      setBroadcasts((b as Broadcast[]) ?? []);
      setWaNumbers((n as WaNumber[]) ?? []);
      setTemplates((t as Template[]) ?? []);
      setLoading(false);
      setRefreshing(false);

      // Preset first number
      if (n && n.length > 0 && !form.waNumberId) {
        const first = n[0] as WaNumber;
        setForm((f) => ({ ...f, waNumberId: first.id, phoneNumberId: first.phone_number_id }));
      }
    },
    [tenantId],
  );

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Poll running broadcasts
  useEffect(() => {
    const hasRunning = broadcasts.some((b) => b.status === "running");
    if (!hasRunning) return;
    const interval = setInterval(() => fetchAll(true), 5000);
    return () => clearInterval(interval);
  }, [broadcasts, fetchAll]);

  // ── Launch broadcast ───────────────────────────────────────────────────────

  async function launchBroadcast() {
    if (!tenantId || !form.waNumberId || !form.templateName) {
      toast({ title: "يُرجى تعبئة الحقول المطلوبة", variant: "destructive" });
      return;
    }
    setSending(true);

    // Find phoneNumberId
    const number = waNumbers.find((n) => n.id === form.waNumberId);
    if (!number) {
      toast({ title: "رقم غير صحيح", variant: "destructive" });
      setSending(false);
      return;
    }

    const { data, error } = await api.post("broadcast_send", {
      tenantId,
      waNumberId: form.waNumberId,
      phoneNumberId: number.phone_number_id,
      template: {
        name: form.templateName,
        language: form.templateLanguage,
      },
      maxCount: form.maxCount ? parseInt(form.maxCount) : undefined,
      delayMs: parseInt(form.delayMs) || 100,
    });

    setSending(false);
    if (error) {
      toast({ title: "فشل إطلاق الحملة", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "✅ تم إطلاق الحملة بنجاح!" });
    setDialogOpen(false);
    fetchAll(true);
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
        title="الحملات الجماعية"
        description="إرسال رسائل واتساب لجهات الاتصال بالجملة"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => fetchAll(true)}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              حملة جديدة
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "إجمالي الحملات",
            value: broadcasts.length,
            icon: Megaphone,
            color: "text-primary",
          },
          {
            label: "جارٍ الإرسال",
            value: broadcasts.filter((b) => b.status === "running").length,
            icon: Loader2,
            color: "text-blue-500",
          },
          {
            label: "رسائل أُرسلت",
            value: totalSent.toLocaleString(),
            icon: Send,
            color: "text-green-500",
          },
          {
            label: "تم التوصيل",
            value: totalDelivered.toLocaleString(),
            icon: CheckCircle2,
            color: "text-emerald-500",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${color}`} />
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Broadcasts list */}
      {broadcasts.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="لا توجد حملات بعد"
          description="أنشئ حملتك الأولى لإرسال رسائل واتساب جماعية"
          action={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 ml-1" />
              حملة جديدة
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {broadcasts.map((bc) => (
            <BroadcastCard key={bc.id} bc={bc} onRefresh={() => fetchAll(true)} />
          ))}
        </div>
      )}

      {/* ── New Broadcast Dialog ── */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) setDialogOpen(false);
        }}
      >
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-5 h-5" />
              حملة إرسال جديدة
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>اسم الحملة (اختياري)</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="حملة العيد — أكتوبر 2024"
                dir="rtl"
              />
            </div>

            {/* Number */}
            <div className="space-y-1.5">
              <Label>رقم الإرسال *</Label>
              <Select
                value={form.waNumberId}
                onValueChange={(v) => {
                  const n = waNumbers.find((x) => x.id === v);
                  setForm((f) => ({
                    ...f,
                    waNumberId: v,
                    phoneNumberId: n?.phone_number_id ?? "",
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر رقماً" />
                </SelectTrigger>
                <SelectContent>
                  {waNumbers.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.phone_e164}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Template */}
            <div className="space-y-1.5">
              <Label>القالب *</Label>
              <Select
                value={form.templateName}
                onValueChange={(v) => {
                  const t = templates.find((x) => x.name === v);
                  setForm((f) => ({
                    ...f,
                    templateName: v,
                    templateLanguage: t?.language ?? "ar",
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر قالباً معتمداً" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.name}>
                      {t.name}
                      <span className="text-muted-foreground mr-2 text-xs">{t.category}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Max count + delay */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>حد أقصى للإرسال (اختياري)</Label>
                <Input
                  type="number"
                  value={form.maxCount}
                  onChange={(e) => setForm((f) => ({ ...f, maxCount: e.target.value }))}
                  placeholder="لا حد"
                  min={1}
                />
              </div>
              <div className="space-y-1.5">
                <Label>تأخير بين الرسائل (ms)</Label>
                <Select
                  value={form.delayMs}
                  onValueChange={(v) => setForm((f) => ({ ...f, delayMs: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50ms — سريع</SelectItem>
                    <SelectItem value="100">100ms — متوسط</SelectItem>
                    <SelectItem value="200">200ms — آمن</SelectItem>
                    <SelectItem value="500">500ms — بطيء</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Warning */}
            <div className="rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
              ⚠️ سيتم الإرسال لجميع جهات الاتصال النشطة في حسابك. تأكد من صحة القالب قبل الإطلاق.
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={launchBroadcast}
              disabled={sending || !form.waNumberId || !form.templateName}
              className="gap-2"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              إطلاق الحملة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default BroadcastsPage;
