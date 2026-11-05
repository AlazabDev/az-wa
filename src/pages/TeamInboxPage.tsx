import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Filter, MessageSquare, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { PageHeading, DataState } from "@/components/WorkspaceUI";

export default function TeamInboxPage() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");

  const { data: accounts = [] } = useQuery({
    queryKey: ["team_accounts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_accounts").select("id, display_name, phone_number");
      return data || [];
    },
  });

  const { data: convs = [], isLoading, error, refetch } = useQuery({
    queryKey: ["team_conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*, contacts(phone, display_name, whatsapp_id)")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = convs.filter((c: any) => {
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    const matchAccount = accountFilter === "all" || c.account_id === accountFilter;
    return matchStatus && matchAccount;
  });

  const stats = {
    total: convs.length,
    unread: convs.reduce((acc, c) => acc + (c.unread_count || 0), 0),
    active: convs.filter((c) => c.status === "active").length,
    pending: convs.filter((c) => c.status === "pending").length,
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PageHeading
        title="صندوق وارد الفريق المشترك"
        subtitle="متابعة جميع محادثات الأرقام والردود الموزعة على أعضاء الفريق"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>إجمالي المحادثات</span>
            <Users size={16} />
          </div>
          <p className="text-2xl font-bold mt-2">{stats.total}</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>رسائل غير مقروءة</span>
            <AlertCircle size={16} className="text-warning" />
          </div>
          <p className="text-2xl font-bold mt-2 text-warning">{stats.unread}</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>محادثات نشطة</span>
            <Clock size={16} className="text-primary" />
          </div>
          <p className="text-2xl font-bold mt-2 text-primary">{stats.active}</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>معلقة وبانتظار الرد</span>
            <CheckCircle2 size={16} className="text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold mt-2">{stats.pending}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={16} className="text-muted-foreground ml-2" />
          {[
            { id: "all", label: "الكل" },
            { id: "active", label: "نشطة" },
            { id: "pending", label: "معلقة" },
            { id: "closed", label: "مغلقة" },
          ].map((item) => (
            <Button
              key={item.id}
              variant={statusFilter === item.id ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        {accounts.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">الرقم:</span>
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="text-xs bg-background border border-border rounded-lg px-3 py-1.5"
            >
              <option value="all">كافة الأرقام</option>
              {accounts.map((acc: any) => (
                <option key={acc.id} value={acc.id}>
                  {acc.display_name} ({acc.phone_number || "افتراضي"})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <DataState error={error} retry={() => refetch()} empty={filtered.length === 0} loading={isLoading}>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                <th className="text-right p-3">العميل / جهة الاتصال</th>
                <th className="text-right p-3">آخر نشاط</th>
                <th className="text-right p-3">غير مقروء</th>
                <th className="text-right p-3">الحالة</th>
                <th className="text-right p-3">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => (
                <tr key={c.id} className="border-b border-border/60 hover:bg-muted/20 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                        <MessageSquare size={16} />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {c.contacts?.display_name || c.contacts?.phone || "جهة اتصال"}
                        </p>
                        <p className="text-xs text-muted-foreground" dir="ltr">
                          {c.contacts?.phone}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {c.last_message_at ? new Date(c.last_message_at).toLocaleDateString("ar-EG") : "-"}
                  </td>
                  <td className="p-3">
                    {c.unread_count > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-primary text-primary-foreground font-semibold">
                        {c.unread_count}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="p-3">
                    <span className="px-2.5 py-1 rounded-full text-xs bg-muted text-muted-foreground border border-border">
                      {c.status === "active" ? "نشط" : c.status === "pending" ? "معلق" : "مغلق"}
                    </span>
                  </td>
                  <td className="p-3">
                    <Button asChild size="sm" variant="ghost">
                      <Link to={`/inbox?conversation=${c.id}`}>فتح المحادثة</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>
    </div>
  );
}
