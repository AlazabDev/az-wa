import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Loader2,
  Megaphone,
  Pause,
  Play,
  Plus,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState, PageHeader, Panel } from "@/components/azwa/page-header";
import { StatusBadge } from "@/components/azwa/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNumbers, useWabas } from "@/lib/azwa-data";
import {
  useTemplates,
  runtimeVariablesOf,
  runtimeComponentsFromValues,
  type Template,
} from "@/lib/azwa-templates";
import {
  cancelCampaign,
  createCampaign,
  launchCampaign,
  listCampaigns,
  type CampaignListItem,
} from "@/lib/campaigns.functions";
import { useScope } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({ meta: [{ title: "Campaigns — AzWA" }] }),
  component: CampaignsPage,
});

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  running: "bg-amber-50 text-amber-700 border-amber-200",
  paused: "bg-orange-50 text-orange-700 border-orange-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

function StatusPill({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${cls}`}
    >
      {status}
    </span>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

// ─── Create Campaign Dialog ───────────────────────────────────────────────────

const inputClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </label>
  );
}

function CreateCampaignDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { data: numbers = [] } = useNumbers();
  const { data: wabas = [] } = useWabas();
  const { data: templates = [] } = useTemplates();
  const create = useServerFn(createCampaign);

  const [name, setName] = useState("");
  const [numberId, setNumberId] = useState(numbers[0]?.id ?? "");
  const [templateId, setTemplateId] = useState("");
  const [recipientsRaw, setRecipientsRaw] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const activeNumbers = numbers.filter((n) => n.enabled && n.status === "active");

  const selectedNumber = useMemo(
    () => numbers.find((n) => n.id === numberId) ?? null,
    [numbers, numberId],
  );

  const wabaId = selectedNumber?.waba_id ?? null;

  const availableTemplates = useMemo(
    () => templates.filter((t) => t.status === "approved" && (!wabaId || t.waba_id === wabaId)),
    [templates, wabaId],
  );

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  const runtimeVars = useMemo(
    () => (selectedTemplate ? runtimeVariablesOf(selectedTemplate.components) : []),
    [selectedTemplate],
  );

  const recipientCount = useMemo(() => {
    return recipientsRaw
      .split(/[\n,;]+/)
      .map((r) => r.replace(/[^0-9]/g, "").trim())
      .filter((r) => r.length >= 7).length;
  }, [recipientsRaw]);

  const templateComponents = useMemo(() => {
    if (!selectedTemplate || runtimeVars.length === 0) return [];
    return runtimeComponentsFromValues(selectedTemplate.components, variableValues);
  }, [selectedTemplate, runtimeVars, variableValues]);

  async function handleSubmit(launch: boolean) {
    if (!name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    if (!numberId) {
      toast.error("Select a sender number");
      return;
    }
    if (!templateId) {
      toast.error("Select a template");
      return;
    }
    if (recipientCount === 0) {
      toast.error("Add at least one valid recipient");
      return;
    }

    setSubmitting(true);
    try {
      const result = await create({
        data: {
          name,
          senderNumberId: numberId,
          templateId,
          recipientsRaw,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          templateComponents,
        },
      });
      toast.success(
        launch
          ? `Campaign created with ${recipientCount} recipients — ready to launch`
          : "Campaign saved as draft",
      );
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-background shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-6 py-4">
          <div className="flex items-center gap-3">
            <Megaphone className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold">New Campaign</h2>
              <p className="text-xs text-muted-foreground">
                Broadcast a WhatsApp template to multiple recipients.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <Field label="Campaign name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ramadan offer 2026"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sender number">
              <select
                className={inputClass}
                value={numberId}
                onChange={(e) => {
                  setNumberId(e.target.value);
                  setTemplateId("");
                }}
              >
                <option value="">Select a number…</option>
                {activeNumbers.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.display_phone_number}
                    {n.verified_name ? ` — ${n.verified_name}` : ""}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Template" hint="Only approved templates from the same WABA are shown.">
              <select
                className={inputClass}
                value={templateId}
                onChange={(e) => {
                  setTemplateId(e.target.value);
                  setVariableValues({});
                }}
                disabled={!numberId}
              >
                <option value="">Select a template…</option>
                {availableTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Template variables */}
          {runtimeVars.length > 0 && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                Template variables (same values for all recipients)
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {runtimeVars.map((variable) => (
                  <Field key={variable.id} label={variable.label}>
                    <input
                      className={inputClass}
                      value={variableValues[variable.id] ?? ""}
                      onChange={(e) =>
                        setVariableValues((prev) => ({ ...prev, [variable.id]: e.target.value }))
                      }
                      placeholder={
                        variable.parameterType === "text" ? "Value" : "https://… or Media ID"
                      }
                    />
                  </Field>
                ))}
              </div>
            </div>
          )}

          <Field
            label={`Recipients (${recipientCount} valid)`}
            hint="One phone number per line, or comma-separated. Country code required (e.g. 2010xxxxxxxx)."
          >
            <Textarea
              value={recipientsRaw}
              onChange={(e) => setRecipientsRaw(e.target.value)}
              placeholder={"2010xxxxxxxx\n2011xxxxxxxx\n2012xxxxxxxx"}
              rows={6}
              className="font-mono text-xs"
            />
          </Field>

          <Field label="Scheduled send (optional — leave empty to save as draft)">
            <input
              type="datetime-local"
              className={inputClass}
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </Field>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border bg-muted/30 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => handleSubmit(false)} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save as draft
          </Button>
          <Button onClick={() => handleSubmit(true)} disabled={submitting || recipientCount === 0}>
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Megaphone className="mr-2 h-4 w-4" />
            )}
            Create campaign
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Campaign detail panel ────────────────────────────────────────────────────

function StatBox({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3 text-center">
      <div className={`text-2xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function CampaignDetailPanel({
  campaign,
  numbers,
  templates,
  onLaunch,
  onCancel,
  onClose,
  busy,
}: {
  campaign: CampaignListItem;
  numbers: ReturnType<typeof useNumbers>["data"];
  templates: Template[];
  onLaunch: (id: string) => void;
  onCancel: (id: string) => void;
  onClose: () => void;
  busy: string | null;
}) {
  const senderNumber = (numbers ?? []).find((n) => n.id === campaign.senderNumberId);
  const template = templates.find((t) => t.id === campaign.templateId);
  const stats = campaign.stats ?? {};
  const isBusy = busy === campaign.id;
  const canLaunch = ["draft", "scheduled"].includes(campaign.status);
  const canCancel = !["completed", "cancelled", "failed"].includes(campaign.status);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/20 px-4 py-3">
        <div>
          <h2 className="font-semibold text-sm">{campaign.name}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {campaign.recipientCount.toLocaleString()} recipients
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={campaign.status} />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Stats grid */}
        {Object.keys(stats).length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <StatBox label="Total" value={stats["total"] ?? campaign.recipientCount} />
            <StatBox label="Sent" value={stats["sent"] ?? 0} tone="text-sky-600" />
            <StatBox label="Delivered" value={stats["delivered"] ?? 0} tone="text-emerald-600" />
            <StatBox label="Read" value={stats["read"] ?? 0} tone="text-emerald-700" />
            <StatBox label="Failed" value={stats["failed"] ?? 0} tone="text-destructive" />
          </div>
        )}

        {/* Meta info */}
        <dl className="space-y-2 text-xs">
          {[
            {
              label: "Sender",
              value: senderNumber?.display_phone_number ?? campaign.senderNumberId ?? "—",
            },
            {
              label: "Template",
              value: template?.name ?? campaign.templateName ?? campaign.templateId ?? "—",
            },
            { label: "Scheduled", value: formatDate(campaign.scheduledAt) },
            { label: "Started", value: formatDate(campaign.startedAt) },
            { label: "Completed", value: formatDate(campaign.completedAt) },
            { label: "Created", value: formatDate(campaign.createdAt) },
          ].map((item) => (
            <div
              key={item.label}
              className="flex justify-between gap-4 border-b border-border/50 pb-1.5"
            >
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className="font-medium text-right">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Actions */}
      {(canLaunch || canCancel) && (
        <div className="shrink-0 flex gap-2 border-t border-border p-4">
          {canLaunch && (
            <Button className="flex-1" onClick={() => onLaunch(campaign.id)} disabled={isBusy}>
              {isBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Launch now
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              className="flex-1 text-destructive hover:bg-destructive/5"
              onClick={() => onCancel(campaign.id)}
              disabled={isBusy}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function CampaignsPage() {
  const { scope } = useScope();
  const queryClient = useQueryClient();
  const { data: numbers = [] } = useNumbers();
  const { data: templates = [] } = useTemplates();

  const loadList = useServerFn(listCampaigns);
  const launch = useServerFn(launchCampaign);
  const cancel = useServerFn(cancelCampaign);

  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<CampaignListItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const PAGE_SIZE = 50;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["campaigns", page, PAGE_SIZE],
    queryFn: () => loadList({ data: { page, limit: PAGE_SIZE } }),
    refetchInterval: 30_000,
  });

  const campaigns = useMemo(() => data?.campaigns ?? [], [data?.campaigns]);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return [c.name, c.status, c.templateName].some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(q),
      );
    });
  }, [campaigns, statusFilter, search]);

  // Summary counters
  const counters = useMemo(() => {
    const result = { draft: 0, running: 0, completed: 0, total: campaigns.length };
    for (const c of campaigns) {
      if (c.status === "draft" || c.status === "scheduled") result.draft++;
      else if (c.status === "running" || c.status === "paused") result.running++;
      else if (c.status === "completed") result.completed++;
    }
    return result;
  }, [campaigns]);

  async function handleLaunch(id: string) {
    if (!window.confirm("Launch this campaign and start sending messages now?")) return;
    setBusy(id);
    try {
      const result = await launch({ data: { campaignId: id } });
      toast.success(`Campaign launched — ${result.queued} messages queued`);
      await refetch();
      // Refresh selected
      setSelected((prev) => (prev?.id === id ? { ...prev, status: "running" } : prev));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Launch failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm("Cancel this campaign? This cannot be undone.")) return;
    setBusy(id);
    try {
      await cancel({ data: { campaignId: id } });
      toast.success("Campaign cancelled");
      await refetch();
      setSelected((prev) => (prev?.id === id ? { ...prev, status: "cancelled" } : prev));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] overflow-hidden">
      {/* Page header */}
      <div className="flex-none p-4 pb-2">
        <PageHeader
          title="Campaigns"
          description="Broadcast WhatsApp templates to lists of contacts. Campaigns are queued as jobs and executed by the worker."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="mr-2 h-4 w-4" /> New campaign
              </Button>
            </div>
          }
        />

        {/* Summary cards */}
        <div className="mt-4 grid grid-cols-4 gap-3">
          {[
            { label: "Total", value: counters.total, color: "text-foreground", bg: "bg-muted/30" },
            {
              label: "Draft / Scheduled",
              value: counters.draft,
              color: "text-blue-600",
              bg: "bg-blue-50",
            },
            {
              label: "Running",
              value: counters.running,
              color: "text-amber-600",
              bg: "bg-amber-50",
            },
            {
              label: "Completed",
              value: counters.completed,
              color: "text-emerald-600",
              bg: "bg-emerald-50",
            },
          ].map((card) => (
            <div
              key={card.label}
              className={`rounded-xl border border-border ${card.bg} p-4 shadow-sm`}
            >
              <p className={`text-2xl font-semibold tabular-nums ${card.color}`}>{card.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{card.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden p-4 pt-2 gap-4">
        {/* Left: list */}
        <div
          className={`flex flex-col flex-1 min-w-0 bg-card border border-border rounded-xl shadow-sm overflow-hidden ${selected ? "hidden lg:flex" : "flex"}`}
        >
          {/* Filters */}
          <div className="p-4 border-b border-border bg-muted/20">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1">
                <input
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                  placeholder="Search campaigns…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All statuses</option>
                {[
                  "draft",
                  "scheduled",
                  "running",
                  "paused",
                  "completed",
                  "cancelled",
                  "failed",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading campaigns…
              </div>
            ) : visible.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title="No campaigns found"
                  hint='Create your first campaign using the "New campaign" button.'
                />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm">
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                    <th className="py-3 px-4 font-medium">Campaign</th>
                    <th className="py-3 pr-4 font-medium">Status</th>
                    <th className="py-3 pr-4 font-medium">Recipients</th>
                    <th className="py-3 pr-4 font-medium">Template</th>
                    <th className="py-3 pr-4 font-medium">Scheduled</th>
                    <th className="py-3 pr-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((campaign) => (
                    <tr
                      key={campaign.id}
                      className={`cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40 transition-colors ${selected?.id === campaign.id ? "bg-primary/5" : ""}`}
                      onClick={() => setSelected(campaign)}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">{campaign.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          {campaign.id.slice(0, 8)}…
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <StatusPill status={campaign.status} />
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-xs">
                        {campaign.recipientCount.toLocaleString()}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {campaign.templateName ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {formatDate(campaign.scheduledAt)}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex gap-1.5">
                          {["draft", "scheduled"].includes(campaign.status) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={busy !== null}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleLaunch(campaign.id);
                              }}
                            >
                              {busy === campaign.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Play className="h-3 w-3" />
                              )}
                              <span className="ml-1">Launch</span>
                            </Button>
                          )}
                          {!["completed", "cancelled", "failed"].includes(campaign.status) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-destructive hover:text-destructive"
                              disabled={busy !== null}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleCancel(campaign.id);
                              }}
                            >
                              <XCircle className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {total} total · page {page} of {totalPages}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || isLoading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right: detail */}
        {selected && (
          <div className="w-full lg:w-[380px] flex-none flex flex-col bg-card border border-border rounded-xl shadow-sm overflow-hidden animate-in slide-in-from-right-4 duration-200">
            <CampaignDetailPanel
              campaign={selected}
              numbers={numbers}
              templates={templates}
              onLaunch={handleLaunch}
              onCancel={handleCancel}
              onClose={() => setSelected(null)}
              busy={busy}
            />
          </div>
        )}
      </div>

      {/* Create dialog */}
      {creating && (
        <CreateCampaignDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void refetch();
          }}
        />
      )}
    </div>
  );
}
