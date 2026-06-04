import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Send, Phone, MessageCircle, Search, CheckCheck, Check, Clock, AlertCircle,
  Smile, Paperclip, Image as ImageIcon, FileText, Reply, X, Mic, File,
  CornerUpLeft, MoreVertical,
} from "lucide-react";
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
  failed_at: string | null;
  provider_message_id: string | null;
  media_filename: string | null;
  media_mime: string | null;
  raw_payload: any;
  interactive_payload: any;
  error_payload: any;
}

const QUICK_EMOJIS = ["👍","❤️","😂","😮","😢","🙏","🔥","🎉","✅","👏","💯","🙌","🤝","👌","😍","😊"];

function StatusIndicator({ m }: { m: Message }) {
  // outbound only
  let icon, label, color = "";
  if (m.status === "failed" || m.failed_at) {
    icon = <AlertCircle className="h-3.5 w-3.5" />;
    label = "فشل الإرسال" + (m.error_payload ? `: ${JSON.stringify(m.error_payload).slice(0,120)}` : "");
    color = "text-destructive";
  } else if (m.read_at) {
    icon = <CheckCheck className="h-3.5 w-3.5" />;
    label = `تمت القراءة • ${new Date(m.read_at).toLocaleString("ar-EG")}`;
    color = "text-sky-400";
  } else if (m.delivered_at) {
    icon = <CheckCheck className="h-3.5 w-3.5" />;
    label = `تم التسليم • ${new Date(m.delivered_at).toLocaleString("ar-EG")}`;
    color = "opacity-80";
  } else if (m.sent_at) {
    icon = <Check className="h-3.5 w-3.5" />;
    label = `تم الإرسال • ${new Date(m.sent_at).toLocaleString("ar-EG")}`;
    color = "opacity-70";
  } else {
    icon = <Clock className="h-3.5 w-3.5" />;
    label = "بانتظار الإرسال";
    color = "opacity-60";
  }
  return (
    <TooltipProvider><Tooltip>
      <TooltipTrigger asChild><span className={cn("inline-flex", color)}>{icon}</span></TooltipTrigger>
      <TooltipContent side="top"><span className="text-xs">{label}</span></TooltipContent>
    </Tooltip></TooltipProvider>
  );
}

function MessageBody({ m }: { m: Message }) {
  const link = m.raw_payload?.[m.type]?.link as string | undefined;
  if (m.type === "image" && link) {
    return (
      <div className="space-y-1">
        <img src={link} alt="" className="rounded-lg max-h-64 object-cover" />
        {m.text && <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>}
      </div>
    );
  }
  if (m.type === "video" && link) {
    return <video src={link} controls className="rounded-lg max-h-64" />;
  }
  if (m.type === "audio" && link) {
    return <audio src={link} controls className="w-56" />;
  }
  if (m.type === "document") {
    return (
      <a href={link} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline">
        <File className="h-4 w-4" />
        <span className="text-sm">{m.media_filename || "مستند"}</span>
      </a>
    );
  }
  if (m.type === "reaction") {
    return <span className="text-2xl">{m.text}</span>;
  }
  if (m.type === "template") {
    return <p className="text-sm italic opacity-90">[قالب] {m.text}</p>;
  }
  return <p className="text-sm whitespace-pre-wrap break-words">{m.text || `[${m.type}]`}</p>;
}

export default function Inbox() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [filterNumber, setFilterNumber] = useState<string>("all");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachType, setAttachType] = useState<"image" | "video" | "audio" | "document">("image");
  const [attachUrl, setAttachUrl] = useState("");
  const [attachCaption, setAttachCaption] = useState("");
  const [attachFilename, setAttachFilename] = useState("");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const { data: templates } = useQuery({
    queryKey: ["wa_templates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("templates")
        .select("id, name, language, body, status")
        .eq("status", "APPROVED" as any)
        .limit(50);
      return data ?? [];
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
        .select("id, conversation_id, direction, type, text, status, created_at, sent_at, delivered_at, read_at, failed_at, provider_message_id, media_filename, media_mime, raw_payload, interactive_payload, error_payload")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as unknown as Message[];
    },
    enabled: !!selectedId,
    refetchInterval: 3000,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages?.length, selectedId]);

  useEffect(() => {
    const ch = supabase
      .channel("inbox-msgs")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        const m = (payload.new ?? payload.old) as Message;
        qc.invalidateQueries({ queryKey: ["conversations"] });
        if (m?.conversation_id === selectedId) qc.invalidateQueries({ queryKey: ["messages", selectedId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedId, qc]);

  const selected = useMemo(() => conversations?.find((c) => c.id === selectedId), [conversations, selectedId]);

  const invokeSend = async (payload: Record<string, unknown>) => {
    if (!selected) return;
    const phone = selected.contacts.wa_id ?? selected.contacts.phone_e164.replace(/[^0-9]/g, "");
    const ctx = replyTo?.provider_message_id ? { context: { message_id: replyTo.provider_message_id } } : {};
    const { data, error } = await supabase.functions.invoke("wa-send", {
      body: { wa_number_id: selected.wa_number_id, to: phone, ...payload, ...ctx },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    setReplyTo(null);
    qc.invalidateQueries({ queryKey: ["messages", selectedId] });
    qc.invalidateQueries({ queryKey: ["conversations"] });
  };

  const handleSendText = async () => {
    if (!draft.trim() || !selected) return;
    setSending(true);
    try {
      await invokeSend({ type: "text", text: draft });
      setDraft("");
    } catch (e: any) {
      toast.error("فشل الإرسال: " + (e.message ?? "خطأ"));
    } finally { setSending(false); }
  };

  const handleSendMedia = async () => {
    if (!attachUrl.trim()) { toast.error("أدخل رابط الملف"); return; }
    setSending(true);
    try {
      await invokeSend({
        type: attachType,
        media: { link: attachUrl.trim(), caption: attachCaption || undefined, filename: attachFilename || undefined },
      });
      setAttachOpen(false); setAttachUrl(""); setAttachCaption(""); setAttachFilename("");
      toast.success("تم الإرسال");
    } catch (e: any) {
      toast.error("فشل الإرسال: " + (e.message ?? "خطأ"));
    } finally { setSending(false); }
  };

  const handleSendTemplate = async (tpl: any) => {
    setSending(true);
    try {
      await invokeSend({
        type: "template",
        template: { name: tpl.name, language: { code: tpl.language || "ar" } },
      });
      setTemplatesOpen(false);
      toast.success("تم إرسال القالب");
    } catch (e: any) {
      toast.error("فشل الإرسال: " + (e.message ?? "خطأ"));
    } finally { setSending(false); }
  };

  const handleReact = async (m: Message, emoji: string) => {
    if (!m.provider_message_id) return;
    try {
      await invokeSend({ type: "reaction", reaction: { message_id: m.provider_message_id, emoji } });
    } catch (e: any) {
      toast.error("فشل التفاعل: " + (e.message ?? "خطأ"));
    }
  };

  const insertEmoji = (e: string) => {
    setDraft((d) => d + e);
    textareaRef.current?.focus();
  };

  const filtered = conversations?.filter((c) => {
    const t = search.toLowerCase();
    return !t || c.contacts.phone_e164.includes(t) || c.contacts.display_name?.toLowerCase().includes(t);
  });

  return (
    <AppLayout title="صندوق الوارد" subtitle="محادثات واتساب المتزامنة عبر جميع الحسابات">
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
              <button key={c.id} onClick={() => { setSelectedId(c.id); setReplyTo(null); }}
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
                  {messages?.map((m) => {
                    const isOut = m.direction === "outbound";
                    const ctxId = m.raw_payload?.context?.id || m.raw_payload?.context?.message_id;
                    const quoted = ctxId ? messages?.find((x) => x.provider_message_id === ctxId) : null;
                    return (
                      <div key={m.id} className={cn("flex group", isOut ? "justify-start" : "justify-end")}>
                        <div className={cn("max-w-[70%] rounded-2xl px-3 py-2 shadow-sm relative",
                          isOut ? "bg-primary text-primary-foreground" : "bg-card border")}>
                          {quoted && (
                            <div className={cn("text-[11px] border-r-2 pr-2 mb-1 opacity-80",
                              isOut ? "border-primary-foreground/60" : "border-primary/60")}>
                              <div className="font-medium">{quoted.direction === "outbound" ? "أنت" : "ردًا"}</div>
                              <div className="truncate max-w-[260px]">{quoted.text || `[${quoted.type}]`}</div>
                            </div>
                          )}
                          <MessageBody m={m} />
                          <div className="flex items-center gap-1 justify-end mt-1 text-[10px] opacity-80">
                            <span>{new Date(m.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
                            {isOut && <StatusIndicator m={m} />}
                          </div>

                          {/* hover actions */}
                          <div className={cn("absolute -top-3 opacity-0 group-hover:opacity-100 transition flex gap-1",
                            isOut ? "left-2" : "right-2")}>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button size="icon" variant="secondary" className="h-6 w-6 rounded-full">
                                  <Smile className="h-3 w-3" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-2" align="center">
                                <div className="grid grid-cols-8 gap-1">
                                  {QUICK_EMOJIS.map((e) => (
                                    <button key={e} onClick={() => handleReact(m, e)}
                                      className="text-xl hover:bg-muted rounded p-1">{e}</button>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                            <Button size="icon" variant="secondary" className="h-6 w-6 rounded-full"
                              onClick={() => setReplyTo(m)}>
                              <CornerUpLeft className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Reply banner */}
              {replyTo && (
                <div className="px-3 py-2 border-t bg-muted/40 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Reply className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium">رد على {replyTo.direction === "outbound" ? "رسالتك" : "العميل"}</div>
                      <div className="text-xs text-muted-foreground truncate">{replyTo.text || `[${replyTo.type}]`}</div>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setReplyTo(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Composer */}
              <div className="p-3 border-t flex items-end gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="icon" variant="ghost" type="button" title="رموز تعبيرية">
                      <Smile className="h-5 w-5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start">
                    <div className="grid grid-cols-8 gap-1">
                      {QUICK_EMOJIS.map((e) => (
                        <button key={e} onClick={() => insertEmoji(e)}
                          className="text-xl hover:bg-muted rounded p-1">{e}</button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="icon" variant="ghost" type="button" title="مرفقات">
                      <Paperclip className="h-5 w-5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-1" align="start">
                    {([
                      { t: "image", label: "صورة", icon: ImageIcon },
                      { t: "video", label: "فيديو", icon: ImageIcon },
                      { t: "audio", label: "صوت", icon: Mic },
                      { t: "document", label: "مستند", icon: FileText },
                    ] as const).map((x) => (
                      <button key={x.t} className="w-full flex items-center gap-2 p-2 hover:bg-muted rounded text-sm"
                        onClick={() => { setAttachType(x.t); setAttachOpen(true); }}>
                        <x.icon className="h-4 w-4" /> {x.label}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>

                <Button size="icon" variant="ghost" type="button" title="القوالب" onClick={() => setTemplatesOpen(true)}>
                  <FileText className="h-5 w-5" />
                </Button>

                <Textarea
                  ref={textareaRef}
                  placeholder="اكتب رسالة..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                  disabled={sending}
                  rows={1}
                  className="min-h-[40px] max-h-32 resize-none"
                />
                <Button onClick={handleSendText} disabled={sending || !draft.trim()} className="gap-2">
                  <Send className="h-4 w-4" /> إرسال
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Attach dialog */}
      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إرسال {attachType === "image" ? "صورة" : attachType === "video" ? "فيديو" : attachType === "audio" ? "ملف صوتي" : "مستند"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>رابط الملف (HTTPS عام)</Label>
              <Input value={attachUrl} onChange={(e) => setAttachUrl(e.target.value)} placeholder="https://..." dir="ltr" />
            </div>
            {attachType === "document" && (
              <div>
                <Label>اسم الملف</Label>
                <Input value={attachFilename} onChange={(e) => setAttachFilename(e.target.value)} placeholder="document.pdf" />
              </div>
            )}
            {attachType !== "audio" && (
              <div>
                <Label>تعليق (اختياري)</Label>
                <Textarea value={attachCaption} onChange={(e) => setAttachCaption(e.target.value)} rows={2} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttachOpen(false)}>إلغاء</Button>
            <Button onClick={handleSendMedia} disabled={sending}>إرسال</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Templates dialog */}
      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>إرسال قالب واتساب</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="approved">
            <TabsList>
              <TabsTrigger value="approved">القوالب المعتمدة</TabsTrigger>
            </TabsList>
            <TabsContent value="approved">
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {!templates?.length && <p className="text-sm text-muted-foreground p-4 text-center">لا توجد قوالب معتمدة</p>}
                {templates?.map((t: any) => (
                  <Card key={t.id} className="p-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-medium">{t.name} <Badge variant="outline" className="ms-2 text-xs">{t.language}</Badge></div>
                      <div className="text-xs text-muted-foreground truncate max-w-md">{t.body}</div>
                    </div>
                    <Button size="sm" onClick={() => handleSendTemplate(t)} disabled={sending}>إرسال</Button>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Indicators legend */}
      <Card className="p-3 mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground" dir="rtl">
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> بانتظار</span>
        <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5" /> أُرسلت</span>
        <span className="flex items-center gap-1"><CheckCheck className="h-3.5 w-3.5" /> تم التسليم</span>
        <span className="flex items-center gap-1"><CheckCheck className="h-3.5 w-3.5 text-sky-400" /> تمت القراءة</span>
        <span className="flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5 text-destructive" /> فشل</span>
      </Card>
    </AppLayout>
  );
}
