import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Plus, ChevronDown, Copy, MoreVertical,
  Webhook, Trash2, AlertCircle, Phone, Activity, CheckCircle2, ShieldCheck
} from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const EVENT_OPTIONS = [
  { value: "message.received", label: "رسالة واردة", icon: "📩" },
  { value: "message.sent", label: "رسالة صادرة", icon: "📤" },
  { value: "message.delivered", label: "تم التسليم", icon: "✅" },
  { value: "message.read", label: "تمت القراءة", icon: "👁" },
  { value: "message.failed", label: "فشل الإرسال", icon: "❌" },
  { value: "conversation.started", label: "محادثة جديدة", icon: "💬" },
  { value: "conversation.closed", label: "إغلاق محادثة", icon: "🔒" },
  { value: "status.changed", label: "تغيير حالة", icon: "🔄" },
];

interface WaNumber {
  id: string;
  phone_e164: string;
  display_phone_number: string | null;
  verified_name: string | null;
  phone_number_id: string;
  status: string;
  wa_account_id: string;
}

interface WebhookTarget {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  has_secret: boolean | null;
  events_filter: string[];
  numbers_filter: string[];
  timeout_ms: number;
  retry_count: number;
  success_rate: number | null;
  last_delivery_at: string | null;
  last_error: string | null;
  created_at: string;
}

export default function Webhooks() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [selectedNumbers, setSelectedNumbers] = useState<string[]>([]);
  const [allNumbers, setAllNumbers] = useState(true);

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ["webhooks"],
    queryFn: async () => {
      // The signing secret is write-only: it is never selected into the client.
      const { data, error } = await supabase
        .from("hub_dispatch_targets")
        .select("id,name,url,is_active,has_secret,events_filter,numbers_filter,timeout_ms,retry_count,success_rate,last_delivery_at,last_error,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as WebhookTarget[];
    },
  });


  const { data: waNumbers } = useQuery({
    queryKey: ["wa_numbers_webhook"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_numbers")
        .select("id, phone_e164, display_phone_number, verified_name, phone_number_id, status, wa_account_id")
        .eq("status", "active");
      if (error) throw error;
      // Deduplicate by phone_number_id
      const seen = new Set<string>();
      return (data as WaNumber[]).filter((n) => {
        if (seen.has(n.phone_number_id)) return false;
        seen.add(n.phone_number_id);
        return true;
      });
    },
  });

  const { data: deliveryStats } = useQuery({
    queryKey: ["webhook_delivery_stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hub_deliveries")
        .select("target_id, status, http_status")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const stats: Record<string, { total: number; success: number; failed: number }> = {};
      (data || []).forEach((d: any) => {
        if (!stats[d.target_id]) stats[d.target_id] = { total: 0, success: 0, failed: 0 };
        stats[d.target_id].total++;
        if (d.status === "delivered") stats[d.target_id].success++;
        else if (d.status === "failed") stats[d.target_id].failed++;
      });
      return stats;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const tenantRes = await supabase.from("tenant_members").select("tenant_id").limit(1).single();
      if (tenantRes.error) throw new Error("يجب تسجيل الدخول أولاً");
      const { error } = await supabase.from("hub_dispatch_targets").insert({
        name: name || url,
        url,
        secret: secret || null,
        events_filter: selectedEvents,
        numbers_filter: allNumbers ? [] : selectedNumbers,
        tenant_id: tenantRes.data.tenant_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      resetForm();
      toast.success("تم إنشاء الويب هوك بنجاح");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("hub_dispatch_targets").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hub_dispatch_targets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("تم حذف الويب هوك");
    },
  });

  const resetForm = () => {
    setDialogOpen(false);
    setName("");
    setUrl("");
    setSecret("");
    setSelectedEvents([]);
    setSelectedNumbers([]);
    setAllNumbers(true);
  };

  const handleSubmit = () => {
    if (!url) return toast.error("يرجى إدخال رابط نقطة النهاية");
    if (selectedEvents.length === 0) return toast.error("يرجى اختيار حدث واحد على الأقل");
    createMutation.mutate();
  };

  const toggleEvent = (ev: string) =>
    setSelectedEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]);

  const toggleNumber = (id: string) =>
    setSelectedNumbers((prev) => prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]);

  const getEventLabel = (val: string) => EVENT_OPTIONS.find((e) => e.value === val)?.label ?? val;

  const getNumberDisplay = (numberId: string) => {
    const num = waNumbers?.find((n) => n.id === numberId);
    return num ? (num.display_phone_number || num.phone_e164) : numberId;
  };

  const activeWebhooks = webhooks?.filter((w) => w.is_active).length ?? 0;
  const totalDeliveries = Object.values(deliveryStats ?? {}).reduce((s, d) => s + d.total, 0);

  return (
    <AppLayout
      title="الويب هوك"
      subtitle={`إدارة نقاط الاستقبال — ${activeWebhooks} نشط من ${webhooks?.length ?? 0}`}
      actions={
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> إضافة ويب هوك
        </Button>
      }
    >
      <div className="space-y-6" dir="rtl">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="shadow-card">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{webhooks?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">إجمالي الويب هوك</p>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-success">{activeWebhooks}</p>
              <p className="text-xs text-muted-foreground">نشط</p>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-info">{waNumbers?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">أرقام متاحة</p>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-warning">{totalDeliveries}</p>
              <p className="text-xs text-muted-foreground">عمليات التسليم</p>
            </CardContent>
          </Card>
        </div>

        {/* Webhooks List */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
        ) : !webhooks?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
              <Webhook className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-lg font-medium">لا توجد ويب هوك</p>
              <p className="text-sm text-muted-foreground">أنشئ ويب هوك لاستقبال إشعارات فورية عن رسائل جميع الأرقام</p>
              <Button onClick={() => setDialogOpen(true)} className="gap-2 mt-2">
                <Plus className="h-4 w-4" /> إنشاء أول ويب هوك
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {webhooks.map((wh) => {
              const events = (wh.events_filter as string[]) || [];
              const numbers = (wh.numbers_filter as string[]) || [];
              const stats = deliveryStats?.[wh.id];
              

              return (
                <Card key={wh.id} className="shadow-card">
                  <CardContent className="p-5 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Webhook className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm">{wh.name}</h3>
                          <code className="text-xs text-muted-foreground font-mono" dir="ltr">{wh.url}</code>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={wh.is_active ? "default" : "secondary"}>
                          {wh.is_active ? "نشط" : "معطل"}
                        </Badge>
                        <Switch
                          checked={wh.is_active}
                          onCheckedChange={(checked) => toggleMutation.mutate({ id: wh.id, is_active: checked })}
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="text-destructive gap-2" onClick={() => deleteMutation.mutate(wh.id)}>
                              <Trash2 className="h-4 w-4" /> حذف
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Numbers Coverage */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">الأرقام:</span>
                      {numbers.length === 0 ? (
                        <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/20">
                          جميع الأرقام ({waNumbers?.length ?? 0})
                        </Badge>
                      ) : (
                        numbers.map((nId) => (
                          <Badge key={nId} variant="outline" className="text-xs font-mono" dir="ltr">
                            {getNumberDisplay(nId)}
                          </Badge>
                        ))
                      )}
                    </div>

                    {/* Events */}
                    {events.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">الأحداث:</span>
                        {events.map((ev) => (
                          <Badge key={ev} variant="outline" className="text-xs">{getEventLabel(ev)}</Badge>
                        ))}
                      </div>
                    )}

                    {/* Stats & Secret Row */}
                    <div className="flex items-center gap-4 flex-wrap text-xs">
                      {stats && (
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground">تسليمات:</span>
                          <span className="text-success">{stats.success} نجح</span>
                          {stats.failed > 0 && <span className="text-destructive">{stats.failed} فشل</span>}
                        </div>
                      )}
                      {wh.last_delivery_at && (
                        <div className="flex items-center gap-1.5">
                          {wh.last_error ? (
                            <AlertCircle className="h-3 w-3 text-destructive" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3 text-success" />
                          )}
                          <span className="text-muted-foreground">
                            آخر تسليم: {new Date(wh.last_delivery_at).toLocaleDateString("ar-SA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Secret:</span>
                        {wh.has_secret ? (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <ShieldCheck className="h-3 w-3 text-success" /> مضبوط (مخزّن على الخادم)
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">غير مضبوط</Badge>
                        )}
                      </div>

                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Numbers Overview */}
        {waNumbers && waNumbers.length > 0 && (
          <Card className="shadow-card">
            <CardContent className="p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                الأرقام المتاحة للويب هوك
              </h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الرقم</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">ويب هوك مرتبطة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {waNumbers.map((num) => {
                      const linkedCount = webhooks?.filter(
                        (w) => w.is_active && ((w.numbers_filter as string[])?.length === 0 || (w.numbers_filter as string[])?.includes(num.id))
                      ).length ?? 0;
                      return (
                        <TableRow key={num.id}>
                          <TableCell className="font-mono text-sm" dir="ltr">
                            {num.display_phone_number || num.phone_e164}
                          </TableCell>
                          <TableCell>
                            <Badge variant={num.status === "active" ? "default" : "secondary"} className="text-xs">
                              {num.status === "active" ? "نشط" : "معلق"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {linkedCount} ويب هوك
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Create Dialog */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setDialogOpen(true); }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>إنشاء ويب هوك جديد</DialogTitle>
              <DialogDescription>استقبل إشعارات فورية لرسائل أرقامك عبر HTTP</DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              {/* Name */}
              <div className="space-y-1.5">
                <Label>الاسم</Label>
                <Input placeholder="مثل: إشعارات الصيانة" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              {/* URL */}
              <div className="space-y-1.5">
                <Label>رابط نقطة النهاية (Endpoint URL)</Label>
                <Input placeholder="https://api.example.com/webhook" value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" />
              </div>

              {/* Numbers Selection */}
              <div className="space-y-2">
                <Label>الأرقام</Label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={allNumbers} onCheckedChange={(c) => { setAllNumbers(!!c); if (c) setSelectedNumbers([]); }} />
                  <span className="text-sm">جميع الأرقام ({waNumbers?.length ?? 0})</span>
                </label>
                {!allNumbers && waNumbers && (
                  <div className="space-y-1.5 mr-6 mt-1">
                    {waNumbers.map((num) => (
                      <label key={num.id} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-muted/50">
                        <Checkbox
                          checked={selectedNumbers.includes(num.id)}
                          onCheckedChange={() => toggleNumber(num.id)}
                        />
                        <span className="text-sm font-mono" dir="ltr">{num.display_phone_number || num.phone_e164}</span>
                        {num.status !== "active" && <Badge variant="secondary" className="text-[10px]">معلق</Badge>}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Events */}
              <div className="space-y-2">
                <Label>الأحداث المراد استقبالها</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {EVENT_OPTIONS.map((ev) => (
                    <label key={ev.value} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer border border-transparent has-[:checked]:border-primary/30 has-[:checked]:bg-primary/5">
                      <Checkbox
                        checked={selectedEvents.includes(ev.value)}
                        onCheckedChange={() => toggleEvent(ev.value)}
                      />
                      <span className="text-xs">{ev.icon}</span>
                      <span className="text-sm">{ev.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Secret */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between px-0 text-sm">
                    إعدادات متقدمة <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <Label>Signing Secret (اختياري)</Label>
                    <Input placeholder="للتحقق من صحة الإشعارات" value={secret} onChange={(e) => setSecret(e.target.value)} dir="ltr" />
                    <p className="text-xs text-muted-foreground">يُرسل في هيدر X-Webhook-Signature</p>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={resetForm}>إلغاء</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                {createMutation.isPending ? "جاري الإنشاء..." : "إنشاء"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
