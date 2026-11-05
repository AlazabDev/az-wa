import { useQuery } from "@tanstack/react-query";
import { Mail, Loader2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { DataState } from "@/components/WorkspaceUI";
import { supabase } from "@/integrations/supabase/client";

export default function MessagesPage() {
  const {user}=useAuth();
  const { data: messages = [], isLoading, error, refetch } = useQuery({
    queryKey: ["messages", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*, conversations(contacts(phone, display_name))")
        .eq("user_id",user?.id??"")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">الرسائل</h1>
        <span className="text-sm text-muted-foreground">{messages.length} رسالة</span>
      </div>

      <DataState error={error} retry={()=>refetch()}><div className="bg-card rounded-lg border border-border overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-muted-foreground" /></div>
        ) : messages.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-3">
            <Mail size={32} />
            <span>لا توجد رسائل مسجلة بعد.</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-right p-3 font-medium text-muted-foreground">الاتجاه</th>
                <th className="text-right p-3 font-medium text-muted-foreground">جهة الاتصال</th>
                <th className="text-right p-3 font-medium text-muted-foreground">المحتوى</th>
                <th className="text-right p-3 font-medium text-muted-foreground">الحالة</th>
                <th className="text-right p-3 font-medium text-muted-foreground">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m: any) => (
                <tr key={m.id} className="border-b border-border hover:bg-muted/30">
                  <td className="p-3">
                    {m.direction === "inbound" ? (
                      <span className="flex items-center gap-1 text-info text-xs"><ArrowDownLeft size={14} /> واردة</span>
                    ) : (
                      <span className="flex items-center gap-1 text-primary text-xs"><ArrowUpRight size={14} /> صادرة</span>
                    )}
                  </td>
                  <td className="p-3 text-foreground">
                    {m.conversations?.contacts?.display_name || m.conversations?.contacts?.phone || "-"}
                  </td>
                  <td className="p-3 text-muted-foreground max-w-md truncate"><Link to={`/inbox?conversation=${m.conversation_id}`} className="hover:text-primary">{m.content||"مرفق"}</Link></td>
                  <td className="p-3"><span className="text-xs px-2 py-0.5 rounded bg-muted">{m.status}</span></td>
                  <td className="p-3 text-muted-foreground text-xs">{new Date(m.created_at).toLocaleString("ar-EG")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div></DataState>
    </div>
  );
}
