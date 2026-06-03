import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  RefreshCw, Copy, CheckCircle2, XCircle, Phone, Webhook, KeyRound,
  Activity, Eye, EyeOff, AlertCircle, Wifi, WifiOff, Send, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NumberHealth {
  id: string;
  phone: string;
  phone_number_id: string;
  ok: boolean;
  verified_name?: string;
  quality?: string;
  error?: string;
  code?: number;
  latency_ms: number;
}

interface HealthResp {
  webhook_url: string;
  api_version: string;
  env: Record<string, boolean>;
  numbers: NumberHealth[];
  summary: { total: number; online: number; offline: number };
}

const VERIFY_TOKEN_HINT = "متغير WA_WEBHOOK_VERIFY_TOKEN (محفوظ بأمان في الخادم)";

const ENV_LABELS: Record<string, string> = {
  WA_ACCESS_TOKEN: "Access Token (إرسال الرسائل)",
  WA_API_VERSION: "API Version",
  WA_APP_SECRET: "App Secret (للتحقق من التوقيع)",
  WA_WEBHOOK_VERIFY_TOKEN: "Webhook Verify Token",
  WA_PHONE_NUMBER_ID: "Phone Number ID (افتراضي)",
  WA_WABA_ID: "WABA ID",
};

export default function Settings() {
  const qc = useQueryClient();
  const [showSecret, setShowSecret] = useState(false);
  const [testing, setTesting] = useState(false);

  // Test send state
  const [testOpen, setTestOpen] = useState(false);
  const [testNumberId, setTestNumberId] = useState<string>("");
  const [testTo, setTestTo] = useState("");
  const [testText, setTestText] = useState("رسالة تجريبية من نظام الإدارة ✅");
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message_id?: string;
    error?: string;
    details?: any;
    status?: string;
    delivered_at?: string | null;
    read_at?: string | null;
    sent_at?: string | null;
  } | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["wa_health"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("wa-health");
      if (error) throw error;
      return data as HealthResp;
    },
    refetchInterval: 60000,
  });

  // Default selected number once health loads
  useEffect(() => {
    if (!testNumberId && data?.numbers?.length) {
      const firstOk = data.numbers.find((n) => n.ok) ?? data.numbers[0];
      setTestNumberId(firstOk.id);
    }
  }, [data, testNumberId]);

  // Poll delivery status after sending
  useEffect(() => {
    if (!testResult?.ok || !testResult.message_id) return;
    let cancelled = false;
    const poll = async () => {
      for (let i = 0; i < 20 && !cancelled; i++) {
        const { data: m } = await supabase
          .from("messages")
          .select("status, sent_at, delivered_at, read_at")
          .eq("provider_message_id", testResult.message_id!)
          .maybeSingle();
        if (m && !cancelled) {
          setTestResult((r) => r && { ...r, status: m.status, sent_at: m.sent_at, delivered_at: m.delivered_at, read_at: m.read_at });
          if (m.read_at || m.delivered_at) break;
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [testResult?.message_id, testResult?.ok]);

  const runTest = async () => {
    setTesting(true);
    try { await refetch(); toast.success("تم تحديث حالة الاتصال"); }
    catch (e: any) { toast.error("فشل: " + e.message); }
    finally { setTesting(false); }
  };

  const sendTest = async () => {
    if (!testNumberId || !testTo.trim() || !testText.trim()) {
      toast.error("اختر رقم المرسل وأدخل رقم المستلم والنص");
      return;
    }
    setSending(true);
    setTestResult(null);
    try {
      const phone = testTo.replace(/[^0-9]/g, "");
      const { data: resp, error } = await supabase.functions.invoke("wa-send", {
        body: { wa_number_id: testNumberId, to: phone, type: "text", text: testText },
      });
      if (error) throw error;
      if ((resp as any)?.error) {
        setTestResult({ ok: false, error: (resp as any).error, details: (resp as any).details });
        toast.error("فشل الإرسال");
      } else {
        setTestResult({ ok: true, message_id: (resp as any).message_id, status: "sent" });
        toast.success("تم الإرسال بنجاح");
      }
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message ?? "خطأ غير معروف" });
      toast.error("فشل: " + (e.message ?? ""));
    } finally {
      setSending(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`تم نسخ ${label}`);
  };

  const allEnvOk = data && Object.values(data.env).every(Boolean);
  const allNumbersOk = data && data.summary.offline === 0 && data.summary.total > 0;
  const overallOk = allEnvOk && allNumbersOk;

  return (
    <AppLayout
      title="الإعدادات"
      subtitle="إعداد الأرقام والمتغيرات والويب هوك مع مؤشرات الاتصال"
      actions={
        <Button onClick={runTest} disabled={testing || isLoading} className="gap-2">
          <RefreshCw className={cn("h-4 w-4", (testing || isLoading) && "animate-spin")} />
          اختبار الاتصال
        </Button>
      }
    >
      <div className="space-y-6" dir="rtl">
        {/* Overall status */}
        <Card className={cn("border-2", overallOk ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5")}>
          <CardContent className="p-5 flex items-center gap-4">
            {overallOk ? (
              <Wifi className="h-10 w-10 text-success" />
            ) : (
              <WifiOff className="h-10 w-10 text-destructive" />
            )}
            <div className="flex-1">
              <h3 className="text-lg font-bold">
                {overallOk ? "النظام متصل بنجاح" : "هناك مشاكل في الاتصال"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {data ? `${data.summary.online}/${data.summary.total} أرقام نشطة • API ${data.api_version}` : "جاري الفحص..."}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold text-success">{data?.summary.online ?? "—"}</p>
                <p className="text-xs text-muted-foreground">متصل</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-destructive">{data?.summary.offline ?? "—"}</p>
                <p className="text-xs text-muted-foreground">معطل</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-info">
                  {data ? Object.values(data.env).filter(Boolean).length : "—"}/{Object.keys(ENV_LABELS).length}
                </p>
                <p className="text-xs text-muted-foreground">متغيرات</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Webhook URL */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-primary" />
              <h3 className="font-bold">رابط الويب هوك (Webhook URL)</h3>
              <Badge variant={data?.env.WA_WEBHOOK_VERIFY_TOKEN ? "default" : "destructive"} className="gap-1">
                {data?.env.WA_WEBHOOK_VERIFY_TOKEN ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {data?.env.WA_WEBHOOK_VERIFY_TOKEN ? "جاهز" : "Verify Token مفقود"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              انسخ هذا الرابط وضعه في Meta App Dashboard → WhatsApp → Configuration → Webhooks
            </p>

            <div className="space-y-2">
              <Label className="text-xs">Callback URL</Label>
              <div className="flex gap-2">
                <Input value={data?.webhook_url ?? ""} readOnly dir="ltr" className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(data?.webhook_url ?? "", "الرابط")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Verify Token</Label>
              <div className="flex gap-2 items-center">
                <Input value={VERIFY_TOKEN_HINT} readOnly className="text-xs" />
                <Badge variant="outline" className="gap-1 whitespace-nowrap">
                  <KeyRound className="h-3 w-3" /> محمي
                </Badge>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-xs">
              <p className="font-semibold">الحقول المطلوب الاشتراك بها في Meta:</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {["messages", "message_template_status_update", "message_status", "account_review_update"].map((f) => (
                  <Badge key={f} variant="secondary" className="font-mono text-[10px]">{f}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Environment Variables */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                <h3 className="font-bold">المتغيرات البيئية</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowSecret(!showSecret)} className="gap-1.5">
                {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showSecret ? "إخفاء" : "إظهار"}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(ENV_LABELS).map(([key, label]) => {
                const ok = data?.env[key];
                return (
                  <div key={key} className={cn("flex items-center gap-3 p-3 rounded-lg border",
                    ok ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5")}>
                    <div className={cn("h-2.5 w-2.5 rounded-full flex-shrink-0",
                      ok ? "bg-success animate-pulse" : "bg-destructive")} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{label}</p>
                      <code className="text-[10px] text-muted-foreground font-mono">{key}</code>
                    </div>
                    {ok ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                );
              })}
            </div>

            {data && !allEnvOk && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
                <AlertCircle className="h-4 w-4 text-warning mt-0.5" />
                <p className="text-xs">
                  بعض المتغيرات غير مضافة. يجب إضافتها من إعدادات Supabase Edge Functions Secrets قبل الاستخدام الفعلي.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Numbers Status */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Phone className="h-5 w-5 text-primary" />
              <h3 className="font-bold">حالة الأرقام مع Meta</h3>
              <Badge variant="outline" className="ml-auto">{data?.summary.total ?? 0} رقم</Badge>
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">جاري الفحص...</div>
            ) : !data?.numbers.length ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Phone className="h-10 w-10 mx-auto mb-2 opacity-30" />
                لا توجد أرقام مسجلة. أضف رقم من صفحة الحسابات.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">الرقم</TableHead>
                    <TableHead className="text-right">الاسم</TableHead>
                    <TableHead className="text-right">الجودة</TableHead>
                    <TableHead className="text-right">Phone Number ID</TableHead>
                    <TableHead className="text-right">الاستجابة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.numbers.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={cn("h-3 w-3 rounded-full",
                            n.ok ? "bg-success animate-pulse shadow-[0_0_8px_hsl(var(--success))]" : "bg-destructive")} />
                          <Badge variant={n.ok ? "default" : "destructive"} className="text-[10px]">
                            {n.ok ? "متصل" : "معطل"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm" dir="ltr">{n.phone}</TableCell>
                      <TableCell className="text-sm">{n.verified_name || "—"}</TableCell>
                      <TableCell>
                        {n.quality ? (
                          <Badge variant="outline" className={cn("text-[10px]",
                            n.quality === "GREEN" && "border-success text-success",
                            n.quality === "YELLOW" && "border-warning text-warning",
                            n.quality === "RED" && "border-destructive text-destructive")}>
                            {n.quality}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <code className="text-[10px] font-mono text-muted-foreground">{n.phone_number_id}</code>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Activity className="h-3 w-3 text-muted-foreground" />
                          <span className={cn("text-xs", n.latency_ms < 500 ? "text-success" : n.latency_ms < 1500 ? "text-warning" : "text-destructive")}>
                            {n.latency_ms}ms
                          </span>
                          {n.error && (
                            <span className="text-[10px] text-destructive truncate max-w-[200px]" title={n.error}>
                              • {n.error}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
