import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { legacySupabase as supabase } from "@/integrations/supabase/legacy-client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Plus,
  ChevronDown,
  Copy,
  MoreVertical,
  Webhook,
  Trash2,
  AlertCircle,
  Phone,
  Activity,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const EVENT_OPTIONS = [
  {
    "group": "جهات الاتصال",
    "events": [
      {
        "value": "contact.created",
        "label": "إنشاء جهة اتصال"
      },
      {
        "value": "contact.updated",
        "label": "تعديل جهة اتصال"
      },
      {
        "value": "contact.blocked",
        "label": "حظر جهة اتصال"
      },
      {
        "value": "contact.unblocked",
        "label": "رفع الحظر عن جهة اتصال"
      },
      {
        "value": "contact.tagged",
        "label": "إضافة وسم لجهة اتصال"
      },
      {
        "value": "contact.untagged",
        "label": "إزالة وسم من جهة اتصال"
      },
      {
        "value": "contact.deleted",
        "label": "حذف جهة اتصال"
      }
    ]
  },
  {
    "group": "الطلبات",
    "events": [
      {
        "value": "order.created",
        "label": "طلب جديد"
      },
      {
        "value": "order.paid",
        "label": "دفع الطلب"
      },
      {
        "value": "order.shipped",
        "label": "شحن الطلب"
      },
      {
        "value": "order.ready_for_pickup",
        "label": "الطلب جاهز للاستلام"
      },
      {
        "value": "order.delivered",
        "label": "تسليم الطلب"
      },
      {
        "value": "order.cancelled",
        "label": "إلغاء الطلب"
      },
      {
        "value": "order.refunded",
        "label": "استرداد الطلب"
      },
      {
        "value": "product.created",
        "label": "منتج جديد"
      },
      {
        "value": "product.updated",
        "label": "تحديث منتج"
      },
      {
        "value": "cart.abandoned",
        "label": "سلة متروكة"
      }
    ]
  },
  {
    "group": "الحجوزات",
    "events": [
      {
        "value": "booking.created",
        "label": "إنشاء حجز"
      },
      {
        "value": "booking.updated",
        "label": "تعديل حجز"
      },
      {
        "value": "booking.cancelled",
        "label": "إلغاء حجز"
      },
      {
        "value": "booking.confirmed",
        "label": "تأكيد حجز"
      }
    ]
  },
  {
    "group": "الحملات",
    "events": [
      {
        "value": "campaign.completed",
        "label": "اكتمال الحملة"
      },
      {
        "value": "campaign.failed",
        "label": "فشل الحملة"
      }
    ]
  },
  {
    "group": "الرسائل",
    "events": [
      {
        "value": "message.received",
        "label": "وصول رسالة"
      },
      {
        "value": "message.sent",
        "label": "إرسال رسالة"
      },
      {
        "value": "conversation.created",
        "label": "إنشاء محادثة"
      },
      {
        "value": "conversation.assigned",
        "label": "إسناد محادثة"
      },
      {
        "value": "conversation.transferred",
        "label": "تحويل محادثة"
      },
      {
        "value": "conversation.closed",
        "label": "إغلاق محادثة"
      },
      {
        "value": "conversation.reopened",
        "label": "إعادة فتح محادثة"
      },
      {
        "value": "conversation.muted",
        "label": "كتم محادثة"
      },
      {
        "value": "conversation.unmuted",
        "label": "إلغاء كتم محادثة"
      },
      {
        "value": "conversation.archived",
        "label": "أرشفة محادثة"
      },
      {
        "value": "conversation.unarchived",
        "label": "استعادة محادثة"
      },
      {
        "value": "conversation.tagged",
        "label": "إضافة وسم لمحادثة"
      },
      {
        "value": "conversation.untagged",
        "label": "إزالة وسم من محادثة"
      },
      {
        "value": "message.delivered",
        "label": "تسليم رسالة"
      },
      {
        "value": "message.read",
        "label": "قراءة رسالة"
      },
      {
        "value": "message.failed",
        "label": "فشل رسالة"
      },
      {
        "value": "conversation.unassigned",
        "label": "إلغاء إسناد محادثة"
      }
    ]
  },
  {
    "group": "الأتمتة",
    "events": [
      {
        "value": "flow.completed",
        "label": "اكتمل التدفق"
      },
      {
        "value": "flow.handoff_requested",
        "label": "طلب تحويل لموظف"
      },
      {
        "value": "conversation.csat_received",
        "label": "وصل تقييم رضا"
      }
    ]
  },
  {
    "group": "الفوترة",
    "events": [
      {
        "value": "invoice.paid",
        "label": "دفعت الفاتورة"
      }
    ]
  }
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
        .select(
          "id,name,url,is_active,has_secret,events_filter,numbers_filter,timeout_ms,retry_count,success_rate,last_delivery_at,last_error,created_at",
        )
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
        .select(
          "id, phone_e164, display_phone_number, verified_name, phone_number_id, status, wa_account_id",
        )
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
        const targetId = String(d.target_id);
        const stat = stats[targetId] ?? (stats[targetId] = { total: 0, success: 0, failed: 0 });
        stat.total++;
        if (d.status === "delivered") stat.success++;
        else if (d.status === "failed") stat.failed++;
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
      const { error } = await supabase
        .from("hub_dispatch_targets")
        .update({ is_active })
        .eq("id", id);
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
    if (!url) {
      toast.error("يرجى إدخال رابط نقطة النهاية");
      return;
    }
    if (selectedEvents.length === 0) {
      toast.error("يرجى اختيار حدث واحد على الأقل");
      return;
    }
    createMutation.mutate();
  };

  const toggleEvent = (ev: string) =>
    setSelectedEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]));

  const toggleNumber = (id: string) =>
    setSelectedNumbers((prev) =>
      prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id],
    );

  const getEventLabel = (val: string) => {
    for (const g of EVENT_OPTIONS) {
      const found = g.events.find((e: any) => e.value === val);
      if (found) return found.label;
    }
    return val;
  };

  const getNumberDisplay = (numberId: string) => {
    const num = waNumbers?.find((n) => n.id === numberId);
    return num ? num.display_phone_number || num.phone_e164 : numberId;
  };

  const activeWebhooks = webhooks?.filter((w) => w.is_active).length ?? 0;
  const totalDeliveries = Object.values(deliveryStats ?? {}).reduce((s, d) => s + d.total, 0);

  return (
    <AppLayout
      title="Webhooks"
      subtitle="أرسل الأحداث لحظياً إلى خادمك. سجل نقطة استقبال، اختر الأحداث التي تريد استقبالها، وسنرسل حمولة JSON موقعة عبر POST كلما وقعت. تحقق من ترويسة X-Widers-Signature للتحقق من المصداقية."
      actions={
        <Button variant="outline" className="gap-2 border-primary text-primary hover:bg-primary/5">
          اقرأ توثيق API
        </Button>
      }
    >
      <div className="space-y-6" dir="rtl">
        <div className="bg-card rounded-xl border p-6 mb-6">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>رابط نقطة الاستقبال</Label>
                <Input
                  placeholder="https://example.com/hooks/widers"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>الاسم (اختياري)</Label>
                <Input
                  placeholder="مثال: مزامنة الطلبات، Zapier"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-4 mt-6">
              <Label className="text-base font-semibold">الأحداث</Label>
              {EVENT_OPTIONS.map((group) => (
                <div key={group.group} className="space-y-3 mt-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">{group.group}</h4>
                  <div className="flex flex-wrap gap-3">
                    {group.events.map((ev) => (
                      <label
                        key={ev.value}
                        className={`flex items-start gap-3 p-3 min-w-[200px] flex-1 rounded-xl border cursor-pointer transition-colors ${selectedEvents.includes(ev.value) ? 'bg-primary/5 border-primary/40' : 'hover:bg-muted/50'}`}
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={selectedEvents.includes(ev.value)}
                          onCheckedChange={() => toggleEvent(ev.value)}
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-mono text-muted-foreground" dir="ltr">{ev.value}</span>
                          <span className="text-xs font-semibold">{ev.label}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-6 mt-6 border-t border-border">
              <Button onClick={handleSubmit} disabled={createMutation.isPending} className="px-8 bg-success hover:bg-success/90">
                {createMutation.isPending ? "جاري الإضافة..." : "إضافة نقطة استقبال"}
              </Button>
            </div>
          </div>
        </div>

        {/* Webhooks List */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
        ) : !webhooks?.length ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            لا توجد نقاط استقبال webhook بعد...
          </div>
        ) : (
          <div className="space-y-4">
            {webhooks.map((wh) => {
              const events = (wh.events_filter as string[]) || [];
              const stats = deliveryStats?.[wh.id];

              return (
                <Card key={wh.id} className="shadow-card">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Webhook className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm">{wh.name}</h3>
                          <code className="text-xs text-muted-foreground font-mono" dir="ltr">
                            {wh.url}
                          </code>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={wh.is_active ? "default" : "secondary"}>
                          {wh.is_active ? "نشط" : "معطل"}
                        </Badge>
                        <Switch
                          checked={wh.is_active}
                          onCheckedChange={(checked) =>
                            toggleMutation.mutate({ id: wh.id, is_active: checked })
                          }
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => deleteMutation.mutate(wh.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
