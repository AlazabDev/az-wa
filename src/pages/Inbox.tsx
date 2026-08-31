import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { legacySupabase as supabase } from "@/integrations/supabase/legacy-client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Send,
  MessageCircle,
  Search,
  CheckCheck,
  Check,
  Clock,
  AlertCircle,
  Smile,
  Paperclip,
  Image as ImageIcon,
  FileText,
  X,
  Mic,
  File,
  CornerUpLeft,
  MoreVertical,
  Phone,
  Video,
  Plus,
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
  last_text?: string | null;
  unread?: number;
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

const QUICK_EMOJIS = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🙏",
  "🔥",
  "🎉",
  "✅",
  "👏",
  "💯",
  "🙌",
  "🤝",
  "👌",
  "😍",
  "😊",
];

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-600",
  "bg-emerald-100 text-emerald-600",
  "bg-amber-100 text-amber-600",
  "bg-rose-100 text-rose-600",
  "bg-violet-100 text-violet-600",
  "bg-cyan-100 text-cyan-600",
  "bg-orange-100 text-orange-600",
];

function avatarFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function formatListTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay) return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === y.toDateString()) return "أمس";
  return d.toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function dateLabel(d: Date) {
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "اليوم";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "أمس";
  return d.toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function StatusIndicator({ m }: { m: Message }) {
  let icon,
    label,
    color = "text-slate-500";
  if (m.status === "failed" || m.failed_at) {
    icon = <AlertCircle className="h-3.5 w-3.5" />;
    label =
      "فشل الإرسال" + (m.error_payload ? `: ${JSON.stringify(m.error_payload).slice(0, 120)}` : "");
    color = "text-destructive";
  } else if (m.read_at) {
    icon = <CheckCheck className="h-4 w-4" />;
    label = `تمت القراءة • ${new Date(m.read_at).toLocaleString("ar-EG")}`;
    color = "text-sky-500";
  } else if (m.delivered_at) {
    icon = <CheckCheck className="h-4 w-4" />;
    label = `تم التسليم • ${new Date(m.delivered_at).toLocaleString("ar-EG")}`;
    color = "text-slate-500";
  } else if (m.sent_at) {
    icon = <Check className="h-4 w-4" />;
    label = `تم الإرسال • ${new Date(m.sent_at).toLocaleString("ar-EG")}`;
    color = "text-slate-500";
  } else {
    icon = <Clock className="h-3.5 w-3.5" />;
    label = "بانتظار الإرسال";
    color = "text-slate-400";
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("inline-flex", color)}>{icon}</span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <span className="text-xs">{label}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MessageBody({ m }: { m: Message }) {
  const link = m.raw_payload?.[m.type]?.link as string | undefined;
  if (m.type === "image" && link) {
    return (
      <div className="space-y-1">
        <img src={link} alt="" className="rounded-lg max-h-64 object-cover" />
        {m.text && <p className="text-sm whitespace-pre-wrap break-words mt-1">{m.text}</p>}
      </div>
    );
  }
  if (m.type === "video" && link)
    return <video src={link} controls className="rounded-lg max-h-64" />;
  if (m.type === "audio" && link) return <audio src={link} controls className="w-56" />;
  if (m.type === "document") {
    return (
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 bg-black/5 dark:bg-white/5 rounded-lg p-2.5 hover:bg-black/10 transition-colors"
      >
        <div className="w-10 h-10 bg-rose-100 rounded flex items-center justify-center shrink-0">
          <File className="h-5 w-5 text-rose-500" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold truncate max-w-[200px]">
            {m.media_filename || "مستند"}
          </div>
          <div className="text-[10px] opacity-60">{m.media_mime || "FILE"}</div>
        </div>
      </a>
    );
  }
  if (m.type === "reaction") return <span className="text-2xl">{m.text}</span>;
  if (m.type === "template") return <p className="text-sm italic opacity-90">[قالب] {m.text}</p>;
  return (
    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
      {m.text || `[${m.type}]`}
    </p>
  );
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
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
    queryKey: ["conversations", filterNumber, selectedId],
    queryFn: async () => {
      let q = supabase
        .from("conversations")
        .select(
          "id, contact_id, wa_number_id, status, last_message_at, contacts(id, phone_e164, display_name, wa_id), wa_numbers(id, phone_number_id, display_phone_number)",
        )
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(100);
      if (filterNumber !== "all") q = q.eq("wa_number_id", filterNumber);
      const { data, error } = await q;
      if (error) throw error;
      const convs = (data ?? []) as unknown as Conversation[];
      // enrich with last text + unread count
      const ids = convs.map((c) => c.id);
      if (ids.length) {
        const { data: lastMsgs } = await supabase
          .from("messages")
          .select("conversation_id, text, type, direction, read_at, created_at")
          .in("conversation_id", ids)
          .order("created_at", { ascending: false })
          .limit(500);
        const lastByConv = new Map<string, any>();
        const unreadByConv = new Map<string, number>();
        for (const m of lastMsgs ?? []) {
          if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
          if (m.direction === "inbound" && !m.read_at && m.conversation_id !== selectedId) {
            unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) ?? 0) + 1);
          }
        }
        for (const c of convs) {
          const last = lastByConv.get(c.id);
          c.last_text = last ? last.text || `[${last.type}]` : null;
          c.unread = unreadByConv.get(c.id) ?? 0;
        }
      }
      return convs;
    },
    refetchInterval: 10000,
  });

  const { data: messages } = useQuery({
    queryKey: ["messages", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, conversation_id, direction, type, text, status, created_at, sent_at, delivered_at, read_at, failed_at, provider_message_id, media_filename, media_mime, raw_payload, interactive_payload, error_payload",
        )
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length, selectedId]);

  useEffect(() => {
    const ch = supabase
      .channel("inbox-msgs")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        const m = (payload.new ?? payload.old) as Message;
        qc.invalidateQueries({ queryKey: ["conversations"] });
        if (m?.conversation_id === selectedId)
          qc.invalidateQueries({ queryKey: ["messages", selectedId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [selectedId, qc]);

  const selected = useMemo(
    () => conversations?.find((c) => c.id === selectedId),
    [conversations, selectedId],
  );

  const invokeSend = async (payload: Record<string, unknown>) => {
    if (!selected) return;
    const phone = selected.contacts.wa_id ?? selected.contacts.phone_e164.replace(/[^0-9]/g, "");
    const ctx = replyTo?.provider_message_id
      ? { context: { message_id: replyTo.provider_message_id } }
      : {};
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
    } finally {
      setSending(false);
    }
  };

  const handleSendMedia = async () => {
    if (!attachUrl.trim()) {
      toast.error("أدخل رابط الملف");
      return;
    }
    setSending(true);
    try {
      await invokeSend({
        type: attachType,
        media: {
          link: attachUrl.trim(),
          caption: attachCaption || undefined,
          filename: attachFilename || undefined,
        },
      });
      setAttachOpen(false);
      setAttachUrl("");
      setAttachCaption("");
      setAttachFilename("");
      toast.success("تم الإرسال");
    } catch (e: any) {
      toast.error("فشل الإرسال: " + (e.message ?? "خطأ"));
    } finally {
      setSending(false);
    }
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
    } finally {
      setSending(false);
    }
  };

  const handleReact = async (m: Message, emoji: string) => {
    if (!m.provider_message_id) return;
    try {
      await invokeSend({
        type: "reaction",
        reaction: { message_id: m.provider_message_id, emoji },
      });
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
    return (
      !t || c.contacts.phone_e164.includes(t) || c.contacts.display_name?.toLowerCase().includes(t)
    );
  });

  // Group messages by date
  const groupedMessages = useMemo(() => {
    if (!messages?.length) return [] as Array<{ date: string; items: Message[] }>;
    const groups: Array<{ date: string; items: Message[] }> = [];
    for (const m of messages) {
      const label = dateLabel(new Date(m.created_at));
      const last = groups[groups.length - 1];
      if (last?.date === label) last.items.push(m);
      else groups.push({ date: label, items: [m] });
    }
    return groups;
  }, [messages]);

  return (
    <AppLayout title="صندوق الوارد" subtitle="محادثات واتساب الحية">
      <div className="-m-6 h-[calc(100vh-3.5rem)] bg-[#f0f2f5]" dir="rtl">
        <div className="h-full flex bg-white overflow-hidden">
          {/* ============ SIDEBAR: Conversations ============ */}
          <aside className="w-[360px] flex flex-col border-l border-slate-200 bg-white shrink-0">
            {/* Sidebar header */}
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <MessageCircle className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">المحادثات</h2>
                  <p className="text-[11px] text-slate-500">{filtered?.length ?? 0} محادثة</p>
                </div>
              </div>
              <div className="flex gap-1 text-slate-500">
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                  <Plus className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Filter + search */}
            <div className="p-3 space-y-2 border-b border-slate-100">
              <Select value={filterNumber} onValueChange={setFilterNumber}>
                <SelectTrigger className="h-9 bg-slate-50 border-slate-200 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الأرقام</SelectItem>
                  {waNumbers?.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.display_phone_number || n.phone_e164}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative bg-slate-100 rounded-lg flex items-center px-3">
                <Search className="h-4 w-4 text-slate-400 shrink-0" />
                <Input
                  placeholder="البحث في الدردشات"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border-0 bg-transparent shadow-none focus-visible:ring-0 h-9 text-sm"
                />
              </div>
            </div>

            {/* Conversations list */}
            <div className="flex-1 overflow-y-auto">
              {!filtered?.length ? (
                <div className="p-12 text-center text-slate-400 text-sm">
                  <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  لا توجد محادثات بعد
                </div>
              ) : (
                filtered.map((c) => {
                  const name = c.contacts.display_name || c.contacts.phone_e164;
                  const initial = (name || "?").trim().charAt(0).toUpperCase();
                  const isActive = selectedId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedId(c.id);
                        setReplyTo(null);
                      }}
                      className={cn(
                        "w-full text-right flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors",
                        isActive ? "bg-slate-100" : "hover:bg-slate-50",
                      )}
                    >
                      <div className="relative shrink-0">
                        <div
                          className={cn(
                            "w-12 h-12 rounded-full flex items-center justify-center font-bold text-base",
                            avatarFor(c.contact_id),
                          )}
                        >
                          {initial}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 border-b border-slate-100 pb-3 -mb-3">
                        <div className="flex justify-between items-center mb-0.5 gap-2">
                          <span className="font-semibold text-slate-800 truncate text-sm">
                            {name}
                          </span>
                          <span
                            className={cn(
                              "text-[11px] shrink-0",
                              c.unread ? "text-emerald-600 font-bold" : "text-slate-400",
                            )}
                          >
                            {formatListTime(c.last_message_at)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <p className="text-xs text-slate-500 truncate flex-1">
                            {c.last_text ?? (
                              <span className="font-mono" dir="ltr">
                                {c.contacts.phone_e164}
                              </span>
                            )}
                          </p>
                          {c.unread ? (
                            <span className="bg-emerald-500 text-white text-[10px] rounded-full min-w-[18px] h-[18px] px-1.5 flex items-center justify-center font-bold shrink-0">
                              {c.unread}
                            </span>
                          ) : c.wa_numbers?.display_phone_number ? (
                            <span
                              className="text-[9px] text-slate-400 font-mono shrink-0"
                              dir="ltr"
                            >
                              ← {c.wa_numbers.display_phone_number}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* ============ MAIN: Chat panel ============ */}
          <main className="flex-1 flex flex-col bg-[#efeae2] relative min-w-0">
            {/* Background pattern */}
            <div
              className="absolute inset-0 opacity-[0.06] pointer-events-none"
              style={{
                backgroundImage: "url('https://www.transparenttextures.com/patterns/cubes.png')",
              }}
            />

            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 relative z-10">
                <div className="text-center max-w-md px-6">
                  <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-white/60 flex items-center justify-center shadow-sm">
                    <MessageCircle className="h-16 w-16 text-emerald-500/70" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-700 mb-2">
                    دردشة واتساب الأعمال
                  </h3>
                  <p className="text-sm text-slate-500">
                    اختر محادثة من القائمة على اليمين لعرض الرسائل والرد عليها. كل الرسائل متزامنة
                    لحظياً عبر حساباتك المتصلة.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <header className="relative z-10 px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center font-bold",
                          avatarFor(selected.contact_id),
                        )}
                      >
                        {(selected.contacts.display_name || selected.contacts.phone_e164)
                          .trim()
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                      <span className="absolute bottom-0 left-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-slate-50" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-800 text-sm truncate">
                        {selected.contacts.display_name || selected.contacts.phone_e164}
                      </h3>
                      <p className="text-[11px] text-slate-500 font-mono truncate" dir="ltr">
                        {selected.contacts.phone_e164}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500 shrink-0">
                    <Badge variant="outline" className="text-[10px] font-mono bg-white" dir="ltr">
                      {selected.wa_numbers.display_phone_number ||
                        selected.wa_numbers.phone_number_id}
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                      <Search className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </header>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto relative z-10 px-6 py-4">
                  <div className="max-w-3xl mx-auto flex flex-col gap-2">
                    {groupedMessages.map((group) => (
                      <div key={group.date} className="flex flex-col gap-2">
                        <div className="flex justify-center my-3">
                          <span className="bg-white/90 text-[11px] text-slate-600 px-3 py-1 rounded-md shadow-sm font-medium">
                            {group.date}
                          </span>
                        </div>
                        {group.items.map((m) => {
                          const isOut = m.direction === "outbound";
                          const ctxId =
                            m.raw_payload?.context?.id || m.raw_payload?.context?.message_id;
                          const quoted = ctxId
                            ? messages?.find((x) => x.provider_message_id === ctxId)
                            : null;
                          return (
                            <div
                              key={m.id}
                              className={cn("flex group", isOut ? "justify-end" : "justify-start")}
                            >
                              <div
                                className={cn(
                                  "max-w-[70%] px-2.5 py-1.5 shadow-sm relative rounded-lg",
                                  isOut
                                    ? "bg-[#d9fdd3] text-slate-800 rounded-tl-none"
                                    : "bg-white text-slate-800 rounded-tr-none",
                                )}
                              >
                                {/* tail */}
                                <svg
                                  viewBox="0 0 8 13"
                                  className={cn(
                                    "absolute top-0 w-2 h-3",
                                    isOut
                                      ? "-left-2 text-[#d9fdd3]"
                                      : "-right-2 text-white scale-x-[-1]",
                                  )}
                                  fill="currentColor"
                                >
                                  <path d="M8 0 L0 0 Q4 0 8 6 Z" />
                                </svg>
                                {quoted && (
                                  <div
                                    className={cn(
                                      "text-[11px] border-r-4 pr-2 py-1 mb-1 rounded bg-black/5",
                                      isOut ? "border-emerald-500" : "border-sky-500",
                                    )}
                                  >
                                    <div className="font-bold text-[10px] opacity-80">
                                      {quoted.direction === "outbound" ? "أنت" : "العميل"}
                                    </div>
                                    <div className="truncate max-w-[260px] opacity-80">
                                      {quoted.text || `[${quoted.type}]`}
                                    </div>
                                  </div>
                                )}
                                <MessageBody m={m} />
                                <div className="flex items-center gap-1 justify-end mt-0.5 text-[10px] text-slate-500">
                                  <span>
                                    {new Date(m.created_at).toLocaleTimeString("ar-EG", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                  {isOut && <StatusIndicator m={m} />}
                                </div>

                                {/* hover actions */}
                                <div
                                  className={cn(
                                    "absolute -top-3 opacity-0 group-hover:opacity-100 transition flex gap-1 z-10",
                                    isOut ? "left-2" : "right-2",
                                  )}
                                >
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="secondary"
                                        className="h-6 w-6 rounded-full shadow"
                                      >
                                        <Smile className="h-3 w-3" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-2" align="center">
                                      <div className="grid grid-cols-8 gap-1">
                                        {QUICK_EMOJIS.map((e) => (
                                          <button
                                            key={e}
                                            onClick={() => handleReact(m, e)}
                                            className="text-xl hover:bg-muted rounded p-1"
                                          >
                                            {e}
                                          </button>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  <Button
                                    size="icon"
                                    variant="secondary"
                                    className="h-6 w-6 rounded-full shadow"
                                    onClick={() => setReplyTo(m)}
                                  >
                                    <CornerUpLeft className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* Reply banner */}
                {replyTo && (
                  <div className="relative z-10 px-4 py-2 border-t bg-slate-50 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-1 h-10 bg-emerald-500 rounded" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-emerald-700">
                          رد على {replyTo.direction === "outbound" ? "رسالتك" : "العميل"}
                        </div>
                        <div className="text-xs text-slate-600 truncate max-w-md">
                          {replyTo.text || `[${replyTo.type}]`}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setReplyTo(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Composer */}
                <footer className="relative z-10 px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-end gap-2 shrink-0">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        type="button"
                        className="h-10 w-10 rounded-full text-slate-500 shrink-0"
                        title="رموز تعبيرية"
                      >
                        <Smile className="h-6 w-6" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2" align="start">
                      <div className="grid grid-cols-8 gap-1">
                        {QUICK_EMOJIS.map((e) => (
                          <button
                            key={e}
                            onClick={() => insertEmoji(e)}
                            className="text-xl hover:bg-muted rounded p-1"
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        type="button"
                        className="h-10 w-10 rounded-full text-slate-500 shrink-0"
                        title="مرفقات"
                      >
                        <Paperclip className="h-6 w-6" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-1" align="start">
                      {(
                        [
                          { t: "image", label: "صورة", icon: ImageIcon },
                          { t: "video", label: "فيديو", icon: Video },
                          { t: "audio", label: "صوت", icon: Mic },
                          { t: "document", label: "مستند", icon: FileText },
                        ] as const
                      ).map((x) => (
                        <button
                          key={x.t}
                          className="w-full flex items-center gap-3 p-2.5 hover:bg-slate-100 rounded text-sm"
                          onClick={() => {
                            setAttachType(x.t);
                            setAttachOpen(true);
                          }}
                        >
                          <x.icon className="h-4 w-4 text-slate-500" /> {x.label}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>

                  <Button
                    size="icon"
                    variant="ghost"
                    type="button"
                    className="h-10 w-10 rounded-full text-slate-500 shrink-0"
                    title="القوالب"
                    onClick={() => setTemplatesOpen(true)}
                  >
                    <FileText className="h-5 w-5" />
                  </Button>

                  <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm px-3 py-1.5 flex items-end">
                    <Textarea
                      ref={textareaRef}
                      placeholder="اكتب رسالة..."
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendText();
                        }
                      }}
                      disabled={sending}
                      rows={1}
                      className="min-h-[28px] max-h-32 resize-none border-0 shadow-none focus-visible:ring-0 px-1 py-1 text-sm bg-transparent"
                    />
                  </div>

                  <Button
                    onClick={handleSendText}
                    disabled={sending || !draft.trim()}
                    size="icon"
                    className="h-10 w-10 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shrink-0"
                  >
                    <Send className="h-5 w-5" />
                  </Button>
                </footer>
              </>
            )}
          </main>
        </div>
      </div>

      {/* Attach dialog */}
      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>
              إرسال{" "}
              {attachType === "image"
                ? "صورة"
                : attachType === "video"
                  ? "فيديو"
                  : attachType === "audio"
                    ? "ملف صوتي"
                    : "مستند"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>رابط الملف (HTTPS عام)</Label>
              <Input
                value={attachUrl}
                onChange={(e) => setAttachUrl(e.target.value)}
                placeholder="https://..."
                dir="ltr"
              />
            </div>
            {attachType === "document" && (
              <div>
                <Label>اسم الملف</Label>
                <Input
                  value={attachFilename}
                  onChange={(e) => setAttachFilename(e.target.value)}
                  placeholder="document.pdf"
                />
              </div>
            )}
            {attachType !== "audio" && (
              <div>
                <Label>تعليق (اختياري)</Label>
                <Textarea
                  value={attachCaption}
                  onChange={(e) => setAttachCaption(e.target.value)}
                  rows={2}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttachOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSendMedia} disabled={sending}>
              إرسال
            </Button>
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
                {!templates?.length && (
                  <p className="text-sm text-muted-foreground p-4 text-center">
                    لا توجد قوالب معتمدة
                  </p>
                )}
                {templates?.map((t: any) => (
                  <Card key={t.id} className="p-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {t.name}{" "}
                        <Badge variant="outline" className="ms-2 text-xs">
                          {t.language}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate max-w-md">
                        {t.body}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleSendTemplate(t)} disabled={sending}>
                      إرسال
                    </Button>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
