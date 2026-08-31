import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { RecordTable } from "@/components/azwa/record-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNumbers } from "@/lib/azwa-data";
import { sendTextMessage } from "@/lib/meta/messaging.functions";
import { useScope } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [{ title: "Inbox — AzWA" }] }),
  component: InboxPage,
});

function InboxPage() {
  const { scope } = useScope();
  const queryClient = useQueryClient();
  const send = useServerFn(sendTextMessage);
  const { data: numbers = [] } = useNumbers();

  const senders = useMemo(() => {
    return numbers.filter((number) => {
      if (!number.enabled) return false;
      if (scope.kind === "number") return number.id === scope.id;
      if (scope.kind === "waba") return number.waba_id === scope.id;
      if (scope.kind === "business") return number.business_portfolio_id === scope.id;
      return true;
    });
  }, [numbers, scope]);

  const [numberId, setNumberId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const effectiveNumberId =
    numberId && senders.some((number) => number.id === numberId)
      ? numberId
      : (senders[0]?.id ?? "");

  const submit = async () => {
    if (!effectiveNumberId || !recipient.trim() || !body.trim()) {
      toast.error("Choose a sender, recipient and message first.");
      return;
    }

    setSending(true);
    try {
      const result = await send({
        data: {
          numberId: effectiveNumberId,
          recipient,
          body,
        },
      });
      setBody("");
      toast.success(`Message submitted to Meta: ${result.metaMessageId}`);
      await queryClient.invalidateQueries({ queryKey: ["record-table"] });
      await queryClient.invalidateQueries({ queryKey: ["ops-counters"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Message send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Send a live WhatsApp message, then inspect conversations, messages, Meta IDs and delivery state below."
      />

      <div className="grid gap-6">
        <Panel title="Send message">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_2fr_auto] lg:items-end">
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Send from
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                value={effectiveNumberId}
                onChange={(event) => setNumberId(event.target.value)}
              >
                {senders.length === 0 && <option value="">No enabled number in scope</option>}
                {senders.map((number) => (
                  <option key={number.id} value={number.id}>
                    {number.internal_name || number.verified_name || number.display_phone_number} —{" "}
                    {number.display_phone_number}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Recipient
              <Input
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="2010xxxxxxxx"
                inputMode="tel"
              />
            </label>

            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Message
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Type the production test message…"
                rows={2}
                maxLength={4096}
              />
            </label>

            <Button
              onClick={submit}
              disabled={sending || !effectiveNumberId}
              className="h-10 gap-2"
            >
              <Send className="size-4" />
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>Sender is never changed automatically.</span>
            <span>Permission and credential resolution are checked server-side.</span>
            <span>Every Meta request is logged without exposing the token.</span>
          </div>
        </Panel>

        <RecordTable
          table="conversations"
          title="Conversations"
          orderBy="last_message_at"
          limit={200}
          columns={[
            { key: "last_message_at", label: "Last message", kind: "date" },
            { key: "status", label: "Status", kind: "status" },
            { key: "priority", label: "Priority", kind: "status" },
            { key: "unread_count", label: "Unread" },
            { key: "whatsapp_number_id", label: "Number", kind: "mono" },
            { key: "contact_id", label: "Contact", kind: "mono" },
            { key: "assigned_user_id", label: "Assigned user", kind: "mono" },
            { key: "assigned_team_id", label: "Assigned team", kind: "mono" },
          ]}
          emptyLabel="No conversations received yet."
        />
        <RecordTable
          table="messages"
          title="Recent messages"
          orderBy="created_at"
          limit={300}
          columns={[
            { key: "created_at", label: "When", kind: "date" },
            { key: "direction", label: "Direction", kind: "status" },
            { key: "message_type", label: "Type" },
            { key: "body", label: "Message" },
            { key: "status", label: "Status", kind: "status" },
            { key: "whatsapp_number_id", label: "Number", kind: "mono" },
            { key: "contact_id", label: "Contact", kind: "mono" },
            { key: "meta_message_id", label: "Meta message", kind: "mono" },
          ]}
          emptyLabel="No messages recorded yet."
        />
        <RecordTable
          table="message_outbox"
          title="Message outbox"
          orderBy="created_at"
          limit={200}
          columns={[
            { key: "created_at", label: "Created", kind: "date" },
            { key: "recipient_address", label: "Recipient", kind: "mono" },
            { key: "message_type", label: "Type" },
            { key: "status", label: "Status", kind: "status" },
            { key: "attempt_count", label: "Attempts" },
            { key: "meta_message_id", label: "Meta message", kind: "mono" },
            { key: "last_error", label: "Last error" },
          ]}
          emptyLabel="No outbound messages queued yet."
        />
      </div>
    </>
  );
}
