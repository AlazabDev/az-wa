import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { legacySupabase as supabase } from "@/integrations/supabase/legacy-client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus, Phone, MoreVertical, CheckCircle, XCircle, Globe, Settings as SettingsIcon,
  Trash2, Save, KeyRound, Webhook, Bell, Shield, RefreshCw, X, Loader2,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface PhoneEntry {
  id: string;
  number: string;
  verifiedName: string;
  quality: string;
  status: string;
}
interface Account {
  id: string;
  name: string;
  phones: PhoneEntry[];
  wabaId: string;
  status: string;
  templates: number;
  currency: string;
  apps: string[];
}

const qualityColors: Record<string, string> = {
  GREEN: "bg-success/10 text-success",
  YELLOW: "bg-warning/10 text-warning",
  RED: "bg-destructive/10 text-destructive",
  UNKNOWN: "bg-muted text-muted-foreground",
};

const WEBHOOK_BASE = `${import.meta.env["VITE_SUPABASE_URL"]}/functions/v1/wa-webhook`;

export default function Accounts() {
  const qc = useQueryClient();
  const { currentTenantId, currentRole } = useAuth();
  const canManage = currentRole === "operator" || currentRole === "admin";

  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Account | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [notifyDelivered, setNotifyDelivered] = useState(true);
  const [notifyRead, setNotifyRead] = useState(false);
  const [notifyFailed, setNotifyFailed] = useState(true);
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [newApp, setNewApp] = useState("");

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["wa-accounts", currentTenantId],
    enabled: Boolean(currentTenantId),
    queryFn: async (): Promise<Account[]> => {
      const [accRes, numRes, tmplRes] = await Promise.all([
        supabase.from("wa_accounts")
          .select("id,label,waba_id,currency,app_bindings")
          .eq("tenant_id", currentTenantId!).order("label"),
        supabase.from("wa_numbers")
          .select("id,wa_account_id,display_phone_number,phone_e164,verified_name,quality_rating,status")
          .eq("tenant_id", currentTenantId!),
        supabase.from("templates")
          .select("id,wa_account_id").eq("tenant_id", currentTenantId!),
      ]);
      if (accRes.error) throw accRes.error;
      if (numRes.error) throw numRes.error;
      if (tmplRes.error) throw tmplRes.error;

      return (accRes.data ?? []).map((acc) => {
        const phones = (numRes.data ?? [])
          .filter((n) => n.wa_account_id === acc.id)
          .map((n) => ({
            id: n.id,
            number: n.display_phone_number || n.phone_e164,
            verifiedName: n.verified_name || "",
            quality: (n.quality_rating || "UNKNOWN").toUpperCase(),
            status: (n.status || "CONNECTED").toUpperCase(),
          }));
        const bindings = Array.isArray(acc.app_bindings) ? (acc.app_bindings as unknown[]) : [];
        return {
          id: acc.id,
          name: acc.label,
          wabaId: acc.waba_id,
          currency: acc.currency || "USD",
          phones,
          status: phones.some((p) => p.status === "CONNECTED") ? "connected" : "disconnected",
          templates: (tmplRes.data ?? []).filter((t) => t.wa_account_id === acc.id).length,
          apps: bindings.map((b) => (typeof b === "string" ? b : String((b as { name?: string })?.name ?? ""))).filter(Boolean),
        };
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (account: Account) => {
      if (!canManage) throw new Error("تحتاج صلاحية operator أو admin");
      const { error } = await supabase.from("wa_accounts").update({
        label: account.name,
        currency: account.currency,
        app_bindings: account.apps,
      }).eq("id", account.id);
      if (error) throw error;

      for (const phone of account.phones) {
        const { error: phoneError } = await supabase.from("wa_numbers").update({
          display_phone_number: phone.number,
          verified_name: phone.verifiedName,
          quality_rating: phone.quality,
          status: phone.status,
        }).eq("id", phone.id);
        if (phoneError) throw phoneError;
      }
    },
    onSuccess: () => {
      toast.success("تم حفظ إعدادات الحساب");
      qc.invalidateQueries({ queryKey: ["wa-accounts"] });
      closeEdit();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (accountId: string) => {
      if (!canManage) throw new Error("تحتاج صلاحية operator أو admin");
      const { error } = await supabase.from("wa_accounts").delete().eq("id", accountId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الحساب");
      qc.invalidateQueries({ queryKey: ["wa-accounts"] });
      closeEdit();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const connectedCount = accounts.filter((a) => a.status === "connected").length;
  const totalPhones = accounts.reduce((sum, a) => sum + a.phones.length, 0);
  const totalTemplates = accounts.reduce((sum, a) => sum + a.templates, 0);

  const openEdit = (acc: Account) => {
    setEditId(acc.id);
    setDraft({ ...acc, phones: acc.phones.map((p) => ({ ...p })), apps: [...acc.apps] });
    setWebhookUrl(`${WEBHOOK_BASE}?waba=${acc.wabaId}`);
    setAccessToken("");
  };
  const closeEdit = () => { setEditId(null); setDraft(null); };

  const updatePhone = (idx: number, patch: Partial<PhoneEntry>) => {
    if (!draft) return;
    setDraft({ ...draft, phones: draft.phones.map((p, i) => (i === idx ? { ...p, ...patch } : p)) });
  };
  const removePhone = (idx: number) => {
    if (!draft) return;
    setDraft({ ...draft, phones: draft.phones.filter((_, i) => i !== idx) });
  };
  const addApp = () => {
    if (!draft || !newApp.trim() || draft.apps.includes(newApp.trim())) return;
    setDraft({ ...draft, apps: [...draft.apps, newApp.trim()] });
    setNewApp("");
  };
  const removeApp = (app: string) => {
    if (!draft) return;
    setDraft({ ...draft, apps: draft.apps.filter((a) => a !== app) });
  };

  return (
    <AppLayout
      title="الحسابات"
      subtitle={`إدارة حسابات واتساب الأعمال — ${connectedCount} متصل من ${accounts.length}`}
      actions={
        <Button size="sm" className="gradient-primary text-primary-foreground" disabled={!canManage}>
          <Plus className="h-4 w-4 ml-1" />
          إضافة حساب
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Card className="shadow-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-primary">{accounts.length}</p><p className="text-xs text-muted-foreground">حسابات WABA</p></CardContent></Card>
          <Card className="shadow-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-success">{totalPhones}</p><p className="text-xs text-muted-foreground">أرقام مرتبطة</p></CardContent></Card>
          <Card className="shadow-card"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-info">{totalTemplates}</p><p className="text-xs text-muted-foreground">إجمالي القوالب</p></CardContent></Card>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">جاري التحميل...</p>
        ) : accounts.length === 0 ? (
          <Card className="shadow-card"><CardContent className="p-8 text-center text-sm text-muted-foreground">
            لا توجد حسابات WABA مرتبطة بهذا الـ Tenant بعد.
          </CardContent></Card>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((account) => (
            <Card key={account.id} className="shadow-card hover:shadow-card-hover transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl gradient-primary flex items-center justify-center">
                      <Phone className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{account.name}</h3>
                      <p className="text-xs text-muted-foreground" dir="ltr">WABA: {account.wabaId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={account.status === "connected" ? "default" : "destructive"} className="text-xs">
                      {account.status === "connected" ? (<><CheckCircle className="h-3 w-3 ml-1" /> متصل</>) : (<><XCircle className="h-3 w-3 ml-1" /> غير متصل</>)}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(account)}>
                          <SettingsIcon className="h-4 w-4 ml-2" /> تعديل
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => qc.invalidateQueries({ queryKey: ["wa-accounts"] })}>
                          <RefreshCw className="h-4 w-4 ml-2" /> تحديث الحالة
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" disabled={!canManage}
                          onClick={() => deleteMutation.mutate(account.id)}>
                          <Trash2 className="h-4 w-4 ml-2" /> حذف
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {account.phones.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {account.phones.map((phone) => (
                      <div key={phone.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs" dir="ltr">{phone.number}</span>
                          {phone.verifiedName && <span className="text-xs text-muted-foreground">({phone.verifiedName})</span>}
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${qualityColors[phone.quality] ?? qualityColors["UNKNOWN"]}`}>
                          {phone.quality === "GREEN" ? "جودة عالية" : phone.quality === "UNKNOWN" ? "غير محدد" : phone.quality}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {account.phones.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-3 text-center py-2 rounded-lg bg-muted/30">لا توجد أرقام مرتبطة</p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-lg bg-muted/50 p-2.5"><p className="text-lg font-bold">{account.templates}</p><p className="text-xs text-muted-foreground">قوالب</p></div>
                  <div className="rounded-lg bg-muted/50 p-2.5"><p className="text-lg font-bold">{account.phones.length}</p><p className="text-xs text-muted-foreground">أرقام</p></div>
                </div>

                {account.apps.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                    <Globe className="h-3 w-3 text-muted-foreground" />
                    {account.apps.map((app, idx) => (
                      <Badge key={idx} variant="outline" className="text-[10px]">{app}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        )}
      </div>

      {/* Edit Account Settings Dialog */}
      <Dialog open={!!editId} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5 text-primary" />
              إعدادات الحساب
            </DialogTitle>
            <DialogDescription>
              تعديل بيانات حساب واتساب الأعمال والأرقام والتكاملات والإشعارات
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <Tabs defaultValue="general" className="mt-2">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="general">عام</TabsTrigger>
                <TabsTrigger value="phones">الأرقام</TabsTrigger>
                <TabsTrigger value="integrations">التكاملات</TabsTrigger>
                <TabsTrigger value="notifications">الإشعارات</TabsTrigger>
              </TabsList>

              {/* General */}
              <TabsContent value="general" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">اسم الحساب</Label>
                    <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">WABA ID</Label>
                    <Input value={draft.wabaId} dir="ltr" className="font-mono" readOnly />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">العملة</Label>
                    <Select value={draft.currency} onValueChange={(v) => setDraft({ ...draft, currency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["USD", "EUR", "SAR", "AED", "EGP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">الحالة</Label>
                    <Input value={draft.status === "connected" ? "متصل" : "غير متصل"} readOnly />
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> إعادة الاتصال التلقائي</p>
                    <p className="text-xs text-muted-foreground mt-0.5">محاولة إعادة الربط تلقائياً عند انقطاع الاتصال</p>
                  </div>
                  <Switch checked={autoReconnect} onCheckedChange={setAutoReconnect} />
                </div>
              </TabsContent>

              {/* Phones */}
              <TabsContent value="phones" className="space-y-3 mt-4">
                {draft.phones.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-6 rounded-lg bg-muted/30">
                    لا توجد أرقام مرتبطة بهذا الحساب
                  </p>
                )}
                {draft.phones.map((p, idx) => (
                  <div key={p.id} className="rounded-lg border p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">رقم #{idx + 1}</Label>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removePhone(idx)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input dir="ltr" placeholder="+1 555 000 0000" value={p.number} onChange={(e) => updatePhone(idx, { number: e.target.value })} />
                      <Input placeholder="الاسم المعتمد" value={p.verifiedName} onChange={(e) => updatePhone(idx, { verifiedName: e.target.value })} />
                      <Select value={p.quality} onValueChange={(v) => updatePhone(idx, { quality: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GREEN">جودة عالية</SelectItem>
                          <SelectItem value="YELLOW">جودة متوسطة</SelectItem>
                          <SelectItem value="RED">جودة منخفضة</SelectItem>
                          <SelectItem value="UNKNOWN">غير محدد</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={p.status} onValueChange={(v) => updatePhone(idx, { status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CONNECTED">متصل</SelectItem>
                          <SelectItem value="DISCONNECTED">غير متصل</SelectItem>
                          <SelectItem value="PENDING">قيد المراجعة</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </TabsContent>

              {/* Integrations */}
              <TabsContent value="integrations" className="space-y-4 mt-4">
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5"><Webhook className="h-3.5 w-3.5" /> رابط Webhook</Label>
                  <Input dir="ltr" className="font-mono text-xs" value={webhookUrl} readOnly />
                  <p className="text-[11px] text-muted-foreground">ضع هذا الرابط في إعدادات Meta للحساب</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> Access Token جديد (اختياري)</Label>
                  <Input dir="ltr" type="password" placeholder="EAAG..." value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">لا يتم تخزين التوكن في المتصفح — يُضبط في أسرار Supabase على الخادم</p>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs">التطبيقات المرتبطة</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {draft.apps.map((app) => (
                      <Badge key={app} variant="secondary" className="gap-1">
                        {app}
                        <button onClick={() => removeApp(app)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                      </Badge>
                    ))}
                    {draft.apps.length === 0 && <span className="text-xs text-muted-foreground">لا توجد تطبيقات</span>}
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder="اسم التطبيق..." value={newApp} onChange={(e) => setNewApp(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addApp(); } }} />
                    <Button variant="outline" onClick={addApp}><Plus className="h-4 w-4" /></Button>
                  </div>
                </div>
              </TabsContent>

              {/* Notifications */}
              <TabsContent value="notifications" className="space-y-3 mt-4">
                {[
                  { label: "إشعار عند تسليم الرسائل", desc: "تنبيه عندما تصل الرسائل للمستلم", val: notifyDelivered, set: setNotifyDelivered },
                  { label: "إشعار عند قراءة الرسائل", desc: "تنبيه عند قراءة العميل للرسالة", val: notifyRead, set: setNotifyRead },
                  { label: "إشعار عند فشل الإرسال", desc: "تنبيه فوري عند فشل أي رسالة", val: notifyFailed, set: setNotifyFailed },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-start gap-3">
                      <Bell className="h-4 w-4 text-primary mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                    <Switch checked={item.val} onCheckedChange={item.set} />
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="destructive" disabled={!canManage || !draft || deleteMutation.isPending}
              onClick={() => draft && deleteMutation.mutate(draft.id)} className="gap-2 ml-auto">
              <Trash2 className="h-4 w-4" /> حذف الحساب
            </Button>
            <Button variant="outline" onClick={closeEdit}>إلغاء</Button>
            <Button onClick={() => draft && saveMutation.mutate(draft)} disabled={!canManage || saveMutation.isPending} className="gap-2">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ التغييرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
