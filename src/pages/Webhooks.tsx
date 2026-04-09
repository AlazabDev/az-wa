import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Plus, ChevronDown, ChevronUp, Eye, EyeOff, Copy, MoreVertical, Webhook, Trash2, AlertCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const WEBHOOK_TYPES = [
  { value: "kapso", label: "Kapso (events)", description: "اختر أحداث Kapso لإرسالها إلى نقطة النهاية" },
  { value: "meta", label: "Meta (forward raw webhook)", description: "يعيد توجيه حمولة Meta webhook الخام" },
];

const EVENT_OPTIONS = [
  { value: "whatsapp.message.received", label: "رسالة مستلمة", description: "عند وصول رسالة جديدة" },
  { value: "whatsapp.message.sent", label: "رسالة مرسلة", description: "عند إرسال رسالة إلى واتساب" },
  { value: "whatsapp.conversation.started", label: "بداية محادثة", description: "عند بدء محادثة جديدة" },
  { value: "whatsapp.conversation.inactive", label: "محادثة غير نشطة", description: "عند عدم إرسال رسائل لفترة" },
  { value: "whatsapp.conversation.ended", label: "انتهاء محادثة", description: "عند إنهاء محادثة" },
  { value: "whatsapp.message.delivered", label: "رسالة تم تسليمها", description: "عند تسليم رسالتك" },
  { value: "whatsapp.message.read", label: "رسالة مقروءة", description: "عند قراءة رسالتك" },
  { value: "whatsapp.message.failed", label: "فشل إرسال رسالة", description: "عند فشل تسليم الرسالة" },
];

interface WebhookFormData {
  name: string;
  webhookType: string;
  url: string;
  secret: string;
  customHeaders: string;
  payloadVersion: string;
  selectedEvents: string[];
  numbersFilter: string[];
}

const initialFormData: WebhookFormData = {
  name: "",
  webhookType: "kapso",
  url: "",
  secret: "",
  customHeaders: "{}",
  payloadVersion: "v2",
  selectedEvents: [],
  numbersFilter: [],
};

export default function Webhooks() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [formData, setFormData] = useState<WebhookFormData>(initialFormData);
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ["webhooks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hub_dispatch_targets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: waNumbers } = useQuery({
    queryKey: ["wa_numbers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("wa_numbers").select("id, phone_e164, display_phone_number, verified_name");
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (form: WebhookFormData) => {
      const { error } = await supabase.from("hub_dispatch_targets").insert({
        name: form.name || form.url,
        url: form.url,
        secret: form.secret || null,
        events_filter: form.selectedEvents,
        numbers_filter: form.numbersFilter,
        tenant_id: (await supabase.from("tenants").select("id").limit(1).single()).data?.id ?? "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      setDialogOpen(false);
      setFormData(initialFormData);
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

  const handleSubmit = () => {
    if (!formData.url) return toast.error("يرجى إدخال رابط نقطة النهاية");
    if (formData.webhookType === "kapso" && formData.selectedEvents.length === 0)
      return toast.error("يرجى اختيار حدث واحد على الأقل");
    createMutation.mutate(formData);
  };

  const toggleEvent = (event: string) => {
    setFormData((prev) => ({
      ...prev,
      selectedEvents: prev.selectedEvents.includes(event)
        ? prev.selectedEvents.filter((e) => e !== event)
        : [...prev.selectedEvents, event],
    }));
  };

  const getEventLabel = (val: string) => EVENT_OPTIONS.find((e) => e.value === val)?.label ?? val;

  return (
    <AppLayout title="الويب هوك" subtitle="إدارة نقاط استقبال الأحداث">
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">الويب هوك</h1>
            <p className="text-muted-foreground text-sm">استقبل تحديثات فورية عند وصول الرسائل أو بدء المحادثات</p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            إضافة ويب هوك
          </Button>
        </div>

        {/* Webhook List */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
        ) : !webhooks?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
              <Webhook className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground">لا توجد ويب هوك مضافة بعد</p>
              <Button variant="outline" onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> إنشاء أول ويب هوك
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {webhooks.map((wh) => {
              const events = (wh.events_filter as string[]) || [];
              const secretVisible = visibleSecrets[wh.id];
              return (
                <Card key={wh.id}>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-wrap">
                        <code className="text-sm bg-muted px-2 py-1 rounded font-mono">{wh.url}</code>
                        <Badge variant={wh.is_active ? "default" : "secondary"}>
                          {wh.is_active ? "نشط" : "معطل"}
                        </Badge>
                        <Badge variant="outline">Kapso</Badge>
                        <Badge variant="outline">v2</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={wh.is_active}
                          onCheckedChange={(checked) => toggleMutation.mutate({ id: wh.id, is_active: checked })}
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="text-destructive gap-2" onClick={() => deleteMutation.mutate(wh.id)}>
                              <Trash2 className="h-4 w-4" /> حذف
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Events */}
                    {events.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {events.map((ev) => (
                          <Badge key={ev} variant="outline" className="text-xs">{getEventLabel(ev)}</Badge>
                        ))}
                      </div>
                    )}

                    {/* Secret */}
                    {wh.secret && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Secret:</span>
                        <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">
                          {secretVisible ? wh.secret : "••••••••••"}
                        </code>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setVisibleSecrets((p) => ({ ...p, [wh.id]: !p[wh.id] }))}>
                          {secretVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(wh.secret!); toast.success("تم النسخ"); }}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    )}

                    {/* Last Delivery */}
                    {wh.last_delivery_at && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">آخر تسليم:</span>
                        {wh.last_error ? (
                          <Badge variant="destructive" className="text-xs gap-1"><AlertCircle className="h-3 w-3" />فشل</Badge>
                        ) : (
                          <Badge variant="default" className="text-xs">نجح</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(wh.last_delivery_at).toLocaleDateString("ar-SA", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                    )}

                    {/* Quick Reference */}
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1 px-0">
                          مرجع سريع <ChevronDown className="h-3 w-3" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-2 bg-muted/50 rounded-lg p-4 text-xs font-mono space-y-1 text-muted-foreground">
                          <p className="font-semibold text-foreground mb-2">Kapso webhooks تتضمن هذه الهيدرز:</p>
                          <p>X-Webhook-Event: whatsapp.message.received</p>
                          <p>X-Webhook-Signature: ...</p>
                          <p>X-Idempotency-Key: unique-key-per-event</p>
                          <p>X-Webhook-Batch: true (if batched)</p>
                          <p>X-Batch-Size: 10 (if batched)</p>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Create Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة Webhook Endpoint</DialogTitle>
              <DialogDescription>استقبل تحديثات فورية لأحداث واتساب</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Webhook Type */}
              <div className="space-y-2">
                <Label>نوع الويب هوك</Label>
                <Select value={formData.webhookType} onValueChange={(v) => setFormData((p) => ({ ...p, webhookType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEBHOOK_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {WEBHOOK_TYPES.find((t) => t.value === formData.webhookType)?.description}
                </p>
              </div>

              {/* Endpoint URL */}
              <div className="space-y-2">
                <Label>Endpoint URL</Label>
                <Input
                  placeholder="https://api.example.com/webhooks/whatsapp"
                  value={formData.url}
                  onChange={(e) => setFormData((p) => ({ ...p, url: e.target.value }))}
                  dir="ltr"
                />
              </div>

              {/* Advanced Settings */}
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between px-0 font-medium">
                    إعدادات متقدمة
                    {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-2">
                  {formData.webhookType === "kapso" && (
                    <div className="space-y-2">
                      <Label>Payload version</Label>
                      <Select value={formData.payloadVersion} onValueChange={(v) => setFormData((p) => ({ ...p, payloadVersion: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="v2">v2 (recommended)</SelectItem>
                          <SelectItem value="v1">v1</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">اختر نسخة payload المرسلة مع كل تسليم</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Signing secret (اختياري)</Label>
                    <Input
                      placeholder="اتركه فارغاً للتوليد التلقائي"
                      value={formData.secret}
                      onChange={(e) => setFormData((p) => ({ ...p, secret: e.target.value }))}
                      dir="ltr"
                    />
                    <p className="text-xs text-muted-foreground">يستخدم لحساب X-Webhook-Signature للتسليمات الصادرة</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Custom Headers (JSON)</Label>
                    <Textarea
                      placeholder="{}"
                      value={formData.customHeaders}
                      onChange={(e) => setFormData((p) => ({ ...p, customHeaders: e.target.value }))}
                      className="font-mono text-sm"
                      rows={3}
                      dir="ltr"
                    />
                    <p className="text-xs text-muted-foreground">اختياري. أضف headers مخصصة كـ key/value pairs</p>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Events (only for Kapso type) */}
              {formData.webhookType === "kapso" && (
                <div className="space-y-3">
                  <Label>الأحداث</Label>
                  <div className="space-y-2">
                    {EVENT_OPTIONS.map((ev) => (
                      <label key={ev.value} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                        <Checkbox
                          checked={formData.selectedEvents.includes(ev.value)}
                          onCheckedChange={() => toggleEvent(ev.value)}
                          className="mt-0.5"
                        />
                        <div>
                          <p className="text-sm font-medium">{ev.label}</p>
                          <p className="text-xs text-muted-foreground">{ev.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">اختر حدثاً واحداً على الأقل للاستقبال</p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                {createMutation.isPending ? "جاري الإنشاء..." : "إنشاء Webhook"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
