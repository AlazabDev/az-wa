import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, Phone, MessageCircle, Search, CheckCheck, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  contact_id: string;
  wa_number_id: string;
  status: string;
  last_message_at: string | null;
  contacts: { id: string; phone_e164: string; display_name: string | null; wa_id: string | null };
  wa_numbers: { id: string; phone_number_id: string; display_phone_number: string | null };
}

interface Message {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  type: string;
  text: string | null;
  status: string;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
}

export default function Inbox() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [filterNumber, setFilterNumber] = useState<string>("all");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: waNumbers } = useQuery({
    queryKey: ["inbox_numbers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_numbers")
        .select("id, phone_e164, display_phone_number, verified_name, phone_number_id")
        .eq("status", "active");
      if (error) throw error;
      return data;
    },
  });

  const { data: conversations } = useQuery({
    queryKey: ["conversations", filterNumber],
    queryFn: async () => {
      let q = supabase
        .from("conversations")
        .select("id, contact_id, wa_number_id, status, last_message_at, contacts(id, phone_e164, display_name, wa_id), wa_numbers(id, phone_number_id, display_phone_number)")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(100);
      if (filterNumber !== "all") q = q.eq("wa_number_id", filterNumber);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Conversation[];
    },
    refetchInterval: 10000,
  });

  const { data: messages } = useQuery({
    queryKey: ["messages", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, direction, type, text, status, created_at, sent_at, delivered_at, read_at")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as Message[];
    },
    enabled: !!selectedId,
    refetchInterval: 3000,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages?.length, selectedId]);

  // Realtime subscription
  useEffect(() => {
    const ch = supabase
      .channel("inbox-msgs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        qc.invalidateQueries({ queryKey: ["conversations"] });
        if (m.conversation_id === selectedId) qc.invalidateQueries({ queryKey: ["messages", selectedId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedId, qc]);

  const selected = conversations?.find((c) => c.id === selectedId);

  const handleSend = async () => {
    if (!draft.trim() || !selected) return;
    setSending(true);
    try {
      const phone = selected.contacts.wa_id ?? selected.contacts.phone_e164.replace(/[^0-9]/g, "");
      const { data, error } = await supabase.functions.invoke("wa-send", {
        body: { wa_number_id: selected.wa_number_id, to: phone, type: "text", text: draft },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setDraft("");
      qc.invalidateQueries({ queryKey: ["messages", selectedId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e: any) {
      toast.error("فشل الإرسال: " + (e.message ?? "خطأ"));
    } finally {
      setSending(false);
    }
  };

  const filtered = conversations?.filter((c) => {
    const t = search.toLowerCase();
    return !t || c.contacts.phone_e164.includes(t) || c.contacts.display_name?.toLowerCase().includes(t);
  });

  return (
    <AppLayout title="صندوق الوارد" subtitle="المحادثات الواردة والصادرة عبر واتساب">
      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-12rem)]" dir="rtl">
        {/* Conversations list */}
        <Card className="col-span-4 flex flex-col overflow-hidden">
          <div className="p-3 border-b space-y-2">
            <Select value={filterNumber} onValueChange={setFilterNumber}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأرقام</SelectItem>
                {waNumbers?.map((n) => (
                  <SelectItem key={n.id} value={n.id}>{n.display_phone_number || n.phone_e164}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-8" />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {!filtered?.length ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
                لا توجد محادثات
              </div>
            ) : filtered.map((c) => (
              <button key={c.id} onClick={() => setSelectedId(c.id)}
                className={cn("w-full text-right p-3 border-b hover:bg-muted/50 transition-colors",
                  selectedId === c.id && "bg-primary/10")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">{c.contacts.display_name || c.contacts.phone_e164}</span>
                  {c.last_message_at && (
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(c.last_message_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-mono" dir="ltr">{c.contacts.phone_e164}</span>
                </div>
              </button>
            ))}
          </ScrollArea>
        </Card>

        {/* Chat panel */}
        <Card className="col-span-8 flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageCircle className="h-16 w-16 mx-auto mb-3 opacity-30" />
                <p>اختر محادثة للبدء</p>
              </div>
            </div>
          ) : (
            <>
              <div className="p-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{selected.contacts.display_name || selected.contacts.phone_e164}</h3>
                  <p className="text-xs text-muted-foreground font-mono" dir="ltr">{selected.contacts.phone_e164}</p>
                </div>
                <Badge variant="outline" className="text-xs font-mono" dir="ltr">
                  من: {selected.wa_numbers.display_phone_number || selected.wa_numbers.phone_number_id}
                </Badge>
              </div>
              <ScrollArea className="flex-1 p-4 bg-muted/20" ref={scrollRef as any}>
                <div className="space-y-2">
                  {messages?.map((m) => (
                    <div key={m.id} className={cn("flex", m.direction === "outbound" ? "justify-start" : "justify-end")}>
                      <div className={cn("max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                        m.direction === "outbound" ? "bg-primary text-primary-foreground" : "bg-card border")}>
                        <p className="whitespace-pre-wrap break-words">{m.text || `[${m.type}]`}</p>
                        <div className="flex items-center gap-1 justify-end mt-1 text-[10px] opacity-70">
                          <span>{new Date(m.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
                          {m.direction === "outbound" && (
                            m.read_at ? <CheckCheck className="h-3 w-3 text-info" /> :
                            m.delivered_at ? <CheckCheck className="h-3 w-3" /> :
                            m.sent_at ? <Check className="h-3 w-3" /> : null
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="p-3 border-t flex gap-2">
                <Input
                  placeholder="اكتب رسالة..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  disabled={sending}
                />
                <Button onClick={handleSend} disabled={sending || !draft.trim()} className="gap-2">
                  <Send className="h-4 w-4" /> إرسال
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
