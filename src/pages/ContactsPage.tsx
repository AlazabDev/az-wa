import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Eye, Phone as PhoneIcon, Plus, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/WorkspaceUI";
import { useNavigate } from "react-router-dom";

export default function ContactsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [whatsappId, setWhatsappId] = useState("");

  const { data: contacts = [], isLoading, error, refetch } = useQuery({
    queryKey: ["contacts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("*").eq("user_id", user?.id ?? "").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("غير مسجل");
      const { error } = await supabase.from("contacts").insert({
        user_id: user.id, phone, display_name: displayName || null, whatsapp_id: whatsappId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تمت إضافة جهة الاتصال");
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setShowAdd(false); setPhone(""); setDisplayName(""); setWhatsappId("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["contacts"] }); qc.invalidateQueries({ queryKey: ["conversations"] }); setSelectedId(null); },
    onError: () => toast.error("تعذر حذف جهة الاتصال"),
  });

  const filtered = contacts.filter(
    (c) => c.phone.includes(search) || (c.whatsapp_id || "").includes(search) || (c.display_name || "").includes(search)
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">جهات اتصال واتساب</h1>
        <Button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <Plus size={16} /> إضافة جهة اتصال
        </Button>
      </div>

      {showAdd && (
        <div className="bg-card border border-border rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="رقم الهاتف *" className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="اسم العرض" className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
            <input value={whatsappId} onChange={(e) => setWhatsappId(e.target.value)} placeholder="معرف واتساب" className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm border border-border rounded-lg">إلغاء</Button>
            <Button onClick={() => addMut.mutate()} disabled={!phone || addMut.isPending} className="px-4 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
              {addMut.isPending ? "..." : "حفظ"}
            </Button>
          </div>
        </div>
      )}

      <div className="relative mb-6 max-w-lg">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pr-9 pl-3 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="ابحث بالهاتف أو بالاسم..."
        />
      </div>

      <DataState error={error} retry={()=>refetch()}><div className="bg-card rounded-lg border border-border overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">لا توجد جهات اتصال بعد. أضف واحدة للبدء.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-right p-3 text-muted-foreground font-medium">الهاتف</th>
                <th className="text-right p-3 text-muted-foreground font-medium">معرف واتساب</th>
                <th className="text-right p-3 text-muted-foreground font-medium">اسم العرض</th>
                <th className="text-right p-3 text-muted-foreground font-medium">تاريخ الإضافة</th>
                <th className="text-right p-3 text-muted-foreground font-medium">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <PhoneIcon size={14} className="text-muted-foreground" />
                      <span className="font-mono text-xs">{c.phone}</span>
                    </div>
                  </td>
                  <td className="p-3 text-foreground">{c.whatsapp_id || "-"}</td>
                  <td className="p-3 text-muted-foreground">{c.display_name || "-"}</td>
                  <td className="p-3 text-muted-foreground text-xs">{new Date(c.created_at).toLocaleDateString("ar-EG")}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" aria-label="عرض جهة الاتصال" onClick={()=>setSelectedId(c.id)}><Eye size={16} /></Button>
                      <Button variant="ghost" size="icon" aria-label="حذف جهة الاتصال" onClick={() => {if(window.confirm("حذف جهة الاتصال ومحادثاتها المرتبطة؟"))delMut.mutate(c.id);}} className="text-muted-foreground hover:text-destructive"><Trash2 size={16} /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div></DataState>
      {selectedId && <div className="mt-5 border-t border-border pt-5"><h2 className="font-semibold">{contacts.find(c=>c.id===selectedId)?.display_name||"جهة اتصال"}</h2><p className="text-sm text-muted-foreground mt-2">{contacts.find(c=>c.id===selectedId)?.phone}</p><Button variant="outline" className="mt-3" onClick={async()=>{if(!user)return;const {data:existing,error:findError}=await supabase.from("conversations").select("id").eq("contact_id",selectedId).eq("user_id",user.id).limit(1);if(findError){toast.error("تعذر فتح المحادثة");return;}if(existing?.[0]){navigate(`/inbox?conversation=${existing[0].id}`);return;}const {data,error}=await supabase.from("conversations").insert({contact_id:selectedId,user_id:user.id,account_id:contacts.find(c=>c.id===selectedId)?.account_id??null}).select("id").single();if(error){toast.error("تعذر إنشاء المحادثة");return;}qc.invalidateQueries({queryKey:["conversations"]});navigate(`/inbox?conversation=${data.id}`);}}>فتح المحادثة</Button><Button variant="ghost" className="mt-3" onClick={()=>setSelectedId(null)}>إغلاق</Button></div>}
    </div>
  );
}
