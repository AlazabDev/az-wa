import { useQuery } from "@tanstack/react-query";
import { legacySupabase as supabase } from "@/integrations/supabase/legacy-client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, MessageSquare, Phone, WalletCards } from "lucide-react";

export default function Dashboard() {
  const { currentTenantId } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-live", currentTenantId],
    enabled: Boolean(currentTenantId),
    refetchInterval: 30000,
    queryFn: async () => {
      const tenantId = currentTenantId!;
      const [numbers, conversations, messages, financeBatches, recentMessages, recentFinance] =
        await Promise.all([
          supabase
            .from("wa_numbers")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("status", "active"),
          supabase
            .from("conversations")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId),
          supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId),
          supabase
            .from("finance_batches")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId),
          supabase
            .from("messages")
            .select("id,direction,type,text,status,created_at,chat_id")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(8),
          supabase
            .from("finance_documents")
            .select("id,file_name,doc_type,vendor,status,currency,total_amount,created_at")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(8),
        ]);
      const firstError = [
        numbers,
        conversations,
        messages,
        financeBatches,
        recentMessages,
        recentFinance,
      ].find((r) => r.error)?.error;
      if (firstError) throw firstError;
      return {
        numbers: numbers.count ?? 0,
        conversations: conversations.count ?? 0,
        messages: messages.count ?? 0,
        financeBatches: financeBatches.count ?? 0,
        recentMessages: recentMessages.data ?? [],
        recentFinance: recentFinance.data ?? [],
      };
    },
  });

  const stats = [
    { title: "أرقام واتساب النشطة", value: data?.numbers ?? 0, icon: Phone },
    { title: "المحادثات", value: data?.conversations ?? 0, icon: MessageSquare },
    { title: "الرسائل المسجلة", value: data?.messages ?? 0, icon: FileText },
    { title: "الدفعات المالية", value: data?.financeBatches ?? 0, icon: WalletCards },
  ];

  return (
    <AppLayout title="لوحة التحكم" subtitle="بيانات حية من الـTenant الحالي">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold mt-1">{isLoading ? "—" : stat.value}</p>
                </div>
                <div className="p-3 rounded-xl bg-muted">
                  <stat.icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">أحدث الرسائل</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!data?.recentMessages.length ? (
                <p className="text-sm text-muted-foreground">لا توجد رسائل.</p>
              ) : (
                data.recentMessages.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 border-b last:border-b-0 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate">{m.text || `[${m.type}]`}</p>
                      <p className="text-muted-foreground font-mono" dir="ltr">
                        {m.chat_id || "—"}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {m.direction} · {m.status}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">أحدث المستندات المالية</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!data?.recentFinance.length ? (
                <p className="text-sm text-muted-foreground">لا توجد مستندات مالية.</p>
              ) : (
                data.recentFinance.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 border-b last:border-b-0 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate">{d.vendor || d.file_name || d.doc_type || d.id}</p>
                      <p className="text-muted-foreground">
                        {d.total_amount != null
                          ? `${d.total_amount} ${d.currency || ""}`
                          : d.doc_type || "—"}
                      </p>
                    </div>
                    <Badge variant={d.status === "failed" ? "destructive" : "outline"}>
                      {d.status}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
