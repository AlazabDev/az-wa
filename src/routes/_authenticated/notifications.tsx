import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Plus, Trash2 } from "lucide-react";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  getNotificationIntegrations,
  createNotificationIntegration,
  deleteNotificationIntegration,
} from "@/lib/notifications.functions";
import { useNumbers } from "@/lib/azwa-data";
import { useScope } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notification Integrations — AzWA" },
      {
        name: "description",
        content: "Route alerts and system notifications to your WhatsApp numbers.",
      },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { scope } = useScope();
  const queryClient = useQueryClient();
  const { data: availableNumbers = [] } = useNumbers();
  const getIntegrationsFn = useServerFn(getNotificationIntegrations);
  const createIntegrationFn = useServerFn(createNotificationIntegration);
  const deleteIntegrationFn = useServerFn(deleteNotificationIntegration);

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["notification_integrations", scope?.id],
    queryFn: () => getIntegrationsFn(),
    enabled: true,
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSenderId, setNewSenderId] = useState("");
  const [newRecipients, setNewRecipients] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const recipientsList = newRecipients
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean);
      if (!newName || !newSenderId || recipientsList.length === 0) {
        throw new Error("Please fill in all fields.");
      }
      return createIntegrationFn({
        data: {
          name: newName,
          senderNumberId: newSenderId,
          recipientNumbers: recipientsList,
        },
      });
    },
    onSuccess: () => {
      toast.success("Integration created successfully.");
      queryClient.invalidateQueries({ queryKey: ["notification_integrations"] });
      setIsCreateOpen(false);
      setNewName("");
      setNewSenderId("");
      setNewRecipients("");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create integration");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return deleteIntegrationFn({ data: { id } });
    },
    onSuccess: () => {
      toast.success("Integration removed.");
      queryClient.invalidateQueries({ queryKey: ["notification_integrations"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete integration");
    },
  });

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
      <PageHeader
        title="Notification Sources"
        description="Connect external systems to send WhatsApp alerts. Generate a unique webhook URL to receive payloads and forward them as WhatsApp messages to specific numbers."
        actions={
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Add Source
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Notification Source</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Integration Name</Label>
                  <Input
                    placeholder="e.g. Billing System Alerts"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sender Number (From)</Label>
                  <Select value={newSenderId} onValueChange={setNewSenderId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a WABA number to send from" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableNumbers.map((n) => (
                        <SelectItem key={n.id} value={n.id}>
                          {n.display_phone_number} {n.verified_name ? `(${n.verified_name})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Recipient Numbers (To)</Label>
                  <Input
                    placeholder="e.g. +123456789, +987654321"
                    value={newRecipients}
                    onChange={(e) => setNewRecipients(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma separated list of phone numbers (with country code).
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Webhook URL</th>
                <th className="py-2 pr-4 font-medium">Sender</th>
                <th className="py-2 pr-4 font-medium">Recipients</th>
                <th className="py-2 pr-4 font-medium">Created At</th>
                <th className="py-2 pr-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Loading integrations...
                  </td>
                </tr>
              )}
              {!isLoading && integrations.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No notification sources configured.
                  </td>
                </tr>
              )}
              {integrations.map((integration: any) => {
                const webhookUrl = `${baseUrl}/api/public/notify/${integration.id}?secret=${integration.webhook_secret}`;
                return (
                  <tr key={integration.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 font-medium">{integration.name}</td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[200px]" title={webhookUrl}>
                          {webhookUrl}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            navigator.clipboard.writeText(webhookUrl);
                            toast.success("Webhook URL copied to clipboard");
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {integration.whatsapp_numbers?.display_phone_number || "Unknown"}
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      <span
                        className="truncate max-w-[150px] inline-block"
                        title={integration.recipient_numbers?.join(", ")}
                      >
                        {integration.recipient_numbers?.join(", ") || "—"}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {new Date(integration.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this integration?")) {
                            deleteMutation.mutate(integration.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
