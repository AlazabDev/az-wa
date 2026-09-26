import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, MessageSquare, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, PageHeader, Panel } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";
import { StatusBadge } from "@/components/azwa/status-badge";
import { ChatMediaBubble } from "@/components/inbox/ChatMediaBubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNumbers } from "@/lib/azwa-data";
import { sendTextMessage } from "@/lib/meta/messaging.functions";
import { readRecordTable } from "@/lib/record-table.functions";
import { useScope } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [{ title: "Inbox — AzWA" }] }),
  component: InboxPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type ConversationRow = {
  id: string;
  whatsapp_number_id: string;
  contact_id: string | null;
  status: string;
  priority: string | null;
  unread_count: number;
  last_message_at: string | null;
  assigned_user_id: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string | null;
  whatsapp_number_id: string;
  direction: "incoming" | "outgoing";
  message_type: string;
  body: string | null;
  status: string;
  meta_message_id: string | null;
  contact_id: string | null;
  created_at: string;
  media_id: string | null;
  media_url: string | null;
  mime_type: string | null;
  filename: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  return isToday
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Conversation thread ──────────────────────────────────────────────────────

function ConversationThread({
  conversationId,
  numberId,
  contactId,
  onBack,
  numbers,
}: {
  conversationId: string;
  numberId: string;
  contactId: string | null;
  onBack: () => void;
  numbers: ReturnType<typeof useNumbers>["data"];
}) {
  const queryClient = useQueryClient();
  const readRecords = useServerFn(readRecordTable);
  const send = useServerFn(sendTextMessage);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const senderNumber = (numbers ?? []).find((n) => n.id === numberId);

  const { data: msgData, isLoading, refetch } = useQuery({
    queryKey: ["conversation-messages", conversationId],
    queryFn: () => readRecords({ data: { table: "messages", orderBy: "created_at", limit: 200, page: 1 } }),
    refetchInterval: 10_000,
  });

  const messages: MessageRow[] = useMemo(
    () =>
      ((msgData?.rows ?? []) as MessageRow[]).filter(
        (m) => m.conversation_id === conversationId,
      ),
    [msgData, conversationId],
  );

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend() {
    if (!body.trim() || !numberId) return;
    setSending(true);
    try {
      const recipientContact = contactId ?? null;
      // We need the recipient's WhatsApp number — derive from conversation messages if possible
      const lastIncoming = [...messages].reverse().find((m) => m.direction === "incoming");
      const recipient = lastIncoming?.contact_id ?? contactId ?? "";
      if (!recipient) {
        toast.error("Cannot determine recipient from this conversation");
        return;
      }
      await send({
        data: { numberId, recipient, body: body.trim(), conversationId, contactId },
      });
      setBody("");
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ["record-table"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  const isMedia = (type: string) =>
    ["image", "video", "audio", "document", "sticker"].includes(type);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/20 px-4 py-3">
        <Button variant="ghost" size="icon" className="h-7 w-7 lg:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">
            {senderNumber?.display_phone_number ?? numberId}
          </p>
          <p className="text-xs text-muted-foreground font-mono truncate">
            {conversationId.slice(0, 12)}…
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {isLoading && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No messages in this conversation.
          </div>
        ) : (
          messages.map((msg) => {
            const isOut = msg.direction === "outgoing";
            return (
              <div key={msg.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[72%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                    isOut
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  {isMedia(msg.message_type) ? (
                    <ChatMediaBubble
                      media={{
                        ...(msg.media_id != null ? { id: msg.media_id } : {}),
                        ...(msg.media_url != null ? { url: msg.media_url } : {}),
                        ...(msg.mime_type != null ? { mime_type: msg.mime_type } : {}),
                        ...(msg.filename != null ? { filename: msg.filename } : {}),
                        type: msg.message_type,
                      }}
                      isOutbound={isOut}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.body ?? "—"}</p>
                  )}
                  <div
                    className={`mt-1 flex items-center gap-1 text-[10px] ${
                      isOut ? "justify-end text-primary-foreground/70" : "text-muted-foreground"
                    }`}
                  >
                    <span>{formatTime(msg.created_at)}</span>
                    {isOut && msg.status && (
                      <span className="capitalize">{msg.status}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div className="shrink-0 border-t border-border p-3 bg-muted/10">
        <div className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 resize-none min-h-10 max-h-32"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <Button
            size="icon"
            className="shrink-0 h-10 w-10 rounded-full"
            onClick={handleSend}
            disabled={sending || !body.trim()}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Shift+Enter for new line · Enter to send
        </p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function InboxPage() {
  const { scope } = useScope();
  const queryClient = useQueryClient();
  const send = useServerFn(sendTextMessage);
  const readRecords = useServerFn(readRecordTable);
  const { data: numbers = [] } = useNumbers();

  const [activeTab, setActiveTab] = useState<"compose" | "conversations">("conversations");
  const [selectedConversation, setSelectedConversation] = useState<ConversationRow | null>(null);

  // Compose state
  const senders = useMemo(
    () =>
      numbers.filter((n) => {
        if (!n.enabled) return false;
        if (scope.kind === "number") return n.id === scope.id;
        if (scope.kind === "waba") return n.waba_id === scope.id;
        if (scope.kind === "business") return n.business_portfolio_id === scope.id;
        return true;
      }),
    [numbers, scope],
  );
  const [numberId, setNumberId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const effectiveNumberId =
    numberId && senders.some((n) => n.id === numberId) ? numberId : (senders[0]?.id ?? "");

  // Conversations query
  const { data: convData, isLoading: convLoading, refetch: refetchConvs } = useQuery({
    queryKey: ["record-table", "conversations", "last_message_at", 100, 1],
    queryFn: () => readRecords({ data: { table: "conversations", orderBy: "last_message_at", limit: 100, page: 1 } }),
    refetchInterval: 15_000,
  });

  const conversations: ConversationRow[] = useMemo(
    () => (convData?.rows ?? []) as ConversationRow[],
    [convData],
  );

  async function handleCompose() {
    if (!effectiveNumberId || !recipient.trim() || !body.trim()) {
      toast.error("Choose a sender, recipient and message first.");
      return;
    }
    setSending(true);
    try {
      const result = await send({ data: { numberId: effectiveNumberId, recipient, body } });
      setBody("");
      toast.success(`Message sent: ${result.metaMessageId}`);
      await queryClient.invalidateQueries({ queryKey: ["record-table"] });
      await queryClient.invalidateQueries({ queryKey: ["ops-counters"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] overflow-hidden">
      <div className="flex-none p-4 pb-2">
        <PageHeader
          title="Inbox"
          description="Send messages, browse conversations and inspect message delivery state."
          actions={
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
              <Button
                variant={activeTab === "conversations" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("conversations")}
              >
                <MessageSquare className="mr-2 h-4 w-4" /> Conversations
              </Button>
              <Button
                variant={activeTab === "compose" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("compose")}
              >
                <Send className="mr-2 h-4 w-4" /> New message
              </Button>
            </div>
          }
        />
      </div>

      {activeTab === "compose" && (
        <div className="flex-none px-4 pb-4">
          <Panel title="Send message">
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_2fr_auto] lg:items-end">
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                Send from
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={effectiveNumberId}
                  onChange={(e) => setNumberId(e.target.value)}
                >
                  {senders.length === 0 && <option value="">No enabled number in scope</option>}
                  {senders.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.internal_name || n.verified_name || n.display_phone_number} — {n.display_phone_number}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                Recipient
                <Input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="2010xxxxxxxx"
                  inputMode="tel"
                />
              </label>

              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                Message
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Type the message…"
                  rows={2}
                  maxLength={4096}
                />
              </label>

              <Button onClick={handleCompose} disabled={sending || !effectiveNumberId} className="h-10 gap-2">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="size-4" />}
                {sending ? "Sending…" : "Send"}
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {activeTab === "conversations" && (
        <div className="flex flex-1 overflow-hidden px-4 pb-4 gap-4">
          {/* Left: conversation list */}
          <div
            className={`flex flex-col bg-card border border-border rounded-xl shadow-sm overflow-hidden ${
              selectedConversation ? "w-72 hidden lg:flex flex-none" : "flex-1"
            }`}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/20 px-4 py-3">
              <p className="text-sm font-semibold">
                Conversations
                {conversations.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                    {conversations.length}
                  </span>
                )}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => refetchConvs()}
                disabled={convLoading}
              >
                <RefreshCw className={`h-4 w-4 ${convLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {convLoading && conversations.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="No conversations" hint="Messages will appear here once the webhook is receiving." />
                </div>
              ) : (
                conversations.map((conv) => {
                  const number = numbers.find((n) => n.id === conv.whatsapp_number_id);
                  const isSelected = selectedConversation?.id === conv.id;
                  return (
                    <button
                      key={conv.id}
                      className={`w-full text-left border-b border-border/60 last:border-0 px-4 py-3 transition-colors hover:bg-muted/40 ${
                        isSelected ? "bg-primary/5" : ""
                      }`}
                      onClick={() => setSelectedConversation(conv)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {number?.display_phone_number ?? conv.whatsapp_number_id.slice(0, 12)}
                          </p>
                          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground truncate">
                            {conv.id.slice(0, 8)}…
                          </p>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          {conv.unread_count > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                              {conv.unread_count}
                            </span>
                          )}
                          <p className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {formatTime(conv.last_message_at)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <StatusBadge value={conv.status} />
                        {conv.priority && conv.priority !== "normal" && (
                          <StatusBadge value={conv.priority} />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: thread */}
          {selectedConversation ? (
            <div className="flex-1 flex flex-col bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <ConversationThread
                key={selectedConversation.id}
                conversationId={selectedConversation.id}
                numberId={selectedConversation.whatsapp_number_id}
                contactId={selectedConversation.contact_id}
                onBack={() => setSelectedConversation(null)}
                numbers={numbers}
              />
            </div>
          ) : (
            <div className="hidden lg:flex flex-1 items-center justify-center bg-card border border-border rounded-xl shadow-sm">
              <div className="text-center">
                <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">Select a conversation to read messages</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Raw tables (collapsed in compose mode) */}
      {activeTab === "compose" && (
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          <RecordTable
            table="message_outbox"
            title="Message outbox"
            orderBy="created_at"
            limit={100}
            columns={[
              { key: "created_at", label: "Created", kind: "date" },
              { key: "recipient_address", label: "Recipient", kind: "mono" },
              { key: "message_type", label: "Type" },
              { key: "status", label: "Status", kind: "status" },
              { key: "attempt_count", label: "Attempts" },
              { key: "meta_message_id", label: "Meta ID", kind: "mono" },
              { key: "last_error", label: "Last error" },
            ]}
            emptyLabel="No outbound messages yet."
          />
        </div>
      )}
    </div>
  );
}
