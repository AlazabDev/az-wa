import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, RefreshCw, Search, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { CreateTemplateDialog } from "@/components/azwa/create-template-dialog";
import { EmptyState, PageHeader, Panel } from "@/components/azwa/page-header";
import { StatusBadge } from "@/components/azwa/status-badge";
import { Button } from "@/components/ui/button";
import { useNumbers, useWabas, type Waba } from "@/lib/azwa-data";
import {
  bodyText,
  buttonsOf,
  componentOf,
  placeholdersOf,
  runtimeComponentsFromValues,
  runtimeVariablesOf,
  useTemplates,
  type Template,
  type TemplateComponent,
} from "@/lib/azwa-templates";
import { sendTemplateMessage } from "@/lib/meta/template-messaging.functions";
import { deleteTemplate, syncTemplates } from "@/lib/meta/templates.functions";
import { useScope } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({
    meta: [
      { title: "Templates — AzWA" },
      {
        name: "description",
        content:
          "Manage WhatsApp templates across every WABA: sync from Meta, inspect approval state, create and submit templates, and delete them in sync with Meta.",
      },
    ],
  }),
  component: TemplatesPage,
});

const inputClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20";

const CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"] as const;
const STATUSES = [
  "approved",
  "pending",
  "rejected",
  "paused",
  "disabled",
  "deleted",
  "draft",
  "unknown",
] as const;

function labelOfWaba(waba: Waba | undefined): string {
  if (!waba) return "—";
  return waba.name ?? waba.meta_waba_id ?? "—";
}

function TemplatesPage() {
  const { scope } = useScope();
  const queryClient = useQueryClient();
  const { data: templates = [], isLoading } = useTemplates();
  const { data: wabas = [] } = useWabas();
  const { data: numbers = [] } = useNumbers();

  const sync = useServerFn(syncTemplates);
  const remove = useServerFn(deleteTemplate);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [wabaFilter, setWabaFilter] = useState("all");
  const [selected, setSelected] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const scopedWabaIds = useMemo<Set<string> | null>(() => {
    if (scope.kind === "all") return null;
    if (!scope.id) return new Set<string>();

    if (scope.kind === "waba") return new Set([scope.id]);
    if (scope.kind === "business") {
      return new Set(
        wabas.filter((waba) => waba.business_portfolio_id === scope.id).map((waba) => waba.id),
      );
    }
    if (scope.kind === "number") {
      const number = numbers.find((item) => item.id === scope.id);
      return new Set(number ? [number.waba_id] : []);
    }
    return new Set<string>();
  }, [scope, wabas, numbers]);

  const scopedWabas = useMemo(
    () => (scopedWabaIds ? wabas.filter((waba) => scopedWabaIds.has(waba.id)) : wabas),
    [wabas, scopedWabaIds],
  );

  const scopedTemplates = useMemo(
    () =>
      scopedWabaIds
        ? templates.filter((template) => scopedWabaIds.has(template.waba_id))
        : templates,
    [templates, scopedWabaIds],
  );

  const wabaName = (id: string): string => labelOfWaba(wabas.find((waba) => waba.id === id));

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedTemplates.filter((template) => {
      if (status !== "all" && template.status !== status) return false;
      if (category !== "all" && template.category !== category) return false;
      if (wabaFilter !== "all" && template.waba_id !== wabaFilter) return false;
      if (!q) return true;

      return (
        template.name.toLowerCase().includes(q) ||
        bodyText(template.components).toLowerCase().includes(q)
      );
    });
  }, [scopedTemplates, status, category, wabaFilter, search]);

  const counts = useMemo(() => {
    const result = { approved: 0, pending: 0, rejected: 0, other: 0 };
    for (const template of scopedTemplates) {
      if (template.status === "approved") result.approved += 1;
      else if (template.status === "pending") result.pending += 1;
      else if (template.status === "rejected") result.rejected += 1;
      else result.other += 1;
    }
    return result;
  }, [scopedTemplates]);

  const syncTargets = useMemo(
    () =>
      scopedWabas.map((waba) => ({
        id: waba.id,
        wabaName: waba.name ?? waba.meta_waba_id ?? "—",
      })),
    [scopedWabas],
  );

  const handleSync = async () => {
    if (!syncTargets.length) {
      toast.error("No WABA in the current scope");
      return;
    }

    setSyncing(true);
    try {
      let total = 0;
      const failures: string[] = [];

      for (const target of syncTargets) {
        const result = await sync({ data: { wabaId: target.id } });
        if (result.ok) total += result.synced ?? 0;
        else failures.push(`${target.wabaName}: ${result.error ?? "Sync failed"}`);
      }

      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      await queryClient.invalidateQueries({ queryKey: ["wabas"] });

      if (failures.length > 0) toast.error(failures[0] as string);
      else toast.success(`${total} template(s) synced from Meta`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (template: Template) => {
    if (!window.confirm(`Delete template "${template.name}" on Meta as well?`)) return;

    try {
      const result = await remove({ data: { templateId: template.id } });
      if (!result.ok) throw new Error(result.error ?? "Delete failed");

      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      setSelected(null);
      toast.success("Template deleted from Meta and marked deleted locally");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  };

  return (
    <>
      <PageHeader
        title="Message Templates"
        description="Manage the template library per WABA. Sync follows the active scope and pulls approval and quality state from Meta."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync from Meta"}
            </Button>
            <Button size="sm" onClick={() => setCreating(true)} disabled={!scopedWabas.length}>
              <Plus className="mr-2 h-4 w-4" /> New template
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Approved", value: counts.approved },
          { label: "Pending", value: counts.pending },
          { label: "Rejected", value: counts.rejected },
          { label: "Other", value: counts.other },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold">{item.value}</p>
          </div>
        ))}
      </div>

      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className={`${inputClass} pl-9`}
              placeholder="Search name or body…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select
            className={`${inputClass} w-[150px]`}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All statuses</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <select
            className={`${inputClass} w-[165px]`}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <select
            className={`${inputClass} w-[210px]`}
            value={wabaFilter}
            onChange={(event) => setWabaFilter(event.target.value)}
          >
            <option value="all">All WABAs</option>
            {scopedWabas.map((waba) => (
              <option key={waba.id} value={waba.id}>
                {waba.name ?? waba.meta_waba_id ?? "—"}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            title="No templates found"
            hint="Run “Sync from Meta” for the current scope, or create and submit a new template."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">WABA</th>
                  <th className="py-2 pr-4 font-medium">Category</th>
                  <th className="py-2 pr-4 font-medium">Lang</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Quality</th>
                  <th className="py-2 pr-4 font-medium">Vars</th>
                  <th className="py-2 pr-4 font-medium" />
                </tr>
              </thead>
              <tbody>
                {visible.map((template) => (
                  <tr
                    key={template.id}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40"
                    onClick={() => setSelected(template)}
                  >
                    <td className="py-2 pr-4 font-mono text-xs">{template.name}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {wabaName(template.waba_id)}
                    </td>
                    <td className="py-2 pr-4 text-xs">{template.category}</td>
                    <td className="py-2 pr-4 text-xs">{template.language}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge value={template.status} />
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {template.quality_rating ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {placeholdersOf(template.components).length}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDelete(template);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {selected && (
        <TemplateDetail
          key={selected.id}
          template={selected}
          wabaName={wabaName(selected.waba_id)}
          onClose={() => setSelected(null)}
        />
      )}

      {creating && (
        <CreateTemplateDialog
          wabas={scopedWabas.map((waba) => ({
            id: waba.id,
            label: waba.name ?? waba.meta_waba_id ?? "—",
          }))}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await queryClient.invalidateQueries({ queryKey: ["templates"] });
          }}
        />
      )}
    </>
  );
}

function Preview({ components }: { components: TemplateComponent[] }) {
  const header = componentOf(components, "HEADER");
  const footer = componentOf(components, "FOOTER");
  const buttons = buttonsOf(components);

  return (
    <div className="rounded-xl border border-border bg-[#efeae2] p-5">
      <div className="max-w-[320px] rounded-lg bg-white p-3 text-slate-900 shadow-sm">
        {header?.text && <p className="mb-1 text-sm font-semibold">{header.text}</p>}
        {header?.format && header.format !== "TEXT" && (
          <p className="mb-2 rounded bg-slate-100 p-2 text-[11px] uppercase text-slate-500">
            {header.format}
          </p>
        )}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {bodyText(components) || "Message body preview…"}
        </p>
        {footer?.text && <p className="mt-2 text-[11px] text-slate-500">{footer.text}</p>}
        {buttons.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-slate-200 pt-2">
            {buttons.map((button, index) => (
              <p
                key={`${button.text ?? "button"}-${index}`}
                className="text-center text-xs font-medium text-sky-600"
              >
                {button.text ?? "Button"}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateDetail({
  template,
  wabaName,
  onClose,
}: {
  template: Template;
  wabaName: string;
  onClose: () => void;
}) {
  const { data: numbers = [] } = useNumbers();
  const send = useServerFn(sendTemplateMessage);
  const senders = numbers.filter((number) => number.enabled && number.waba_id === template.waba_id);
  const [numberId, setNumberId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [sending, setSending] = useState(false);
  const runtimeVariables = runtimeVariablesOf(template.components);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const effectiveNumberId =
    numberId && senders.some((number) => number.id === numberId)
      ? numberId
      : (senders[0]?.id ?? "");

  const handleSendTest = async () => {
    if (template.status !== "approved") {
      toast.error("Only approved templates can be sent");
      return;
    }
    if (!effectiveNumberId || !recipient.trim()) {
      toast.error("Choose a sender and recipient");
      return;
    }

    let runtimeComponents = runtimeComponentsFromValues(template.components, variableValues);
    const missing = runtimeVariables.filter(
      (variable) => !(variableValues[variable.id] ?? "").trim(),
    );
    if (missing.length > 0) {
      toast.error(`Fill runtime value: ${missing[0]?.label ?? "template variable"}`);
      return;
    }

    if (authTemplate) {
      const code = authenticationCode.trim();
      if (!code) {
        toast.error("Authentication code is required");
        return;
      }
      const otpButtonIndex = buttonsOf(template.components).findIndex(
        (button) => (button.type ?? "").toUpperCase() === "OTP",
      );
      runtimeComponents = [
        { type: "body", parameters: [{ type: "text", text: code }] },
        ...(otpButtonIndex >= 0
          ? [
              {
                type: "button",
                sub_type: "url",
                index: String(otpButtonIndex),
                parameters: [{ type: "text", text: code }],
              },
            ]
          : []),
      ];
    }

    setSending(true);
    try {
      const result = await send({
        data: {
          numberId: effectiveNumberId,
          templateId: template.id,
          recipient,
          components: runtimeComponents,
        },
      });
      toast.success(`Template sent through Meta: ${result.metaMessageId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Template send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto bg-background p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-mono text-sm font-semibold">{template.name}</h2>
            <p className="text-xs text-muted-foreground">
              {wabaName} · {template.language} · {template.category}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <StatusBadge value={template.status} />
          {template.quality_rating && <StatusBadge value={template.quality_rating} />}
        </div>

        {template.rejection_reason && (
          <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {template.rejection_reason}
          </p>
        )}

        <Preview components={template.components} />

        <dl className="mt-5 space-y-3 text-xs">
          <DetailRow label="Meta template ID" value={template.meta_template_id ?? "—"} />
          <DetailRow
            label="Variables"
            value={placeholdersOf(template.components).join(", ") || "—"}
          />
          <DetailRow label="Last synced" value={formatDate(template.last_synced_at)} />
          <DetailRow label="Updated" value={formatDate(template.updated_at)} />
        </dl>

        <div className="mt-6 rounded-lg border border-border p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Send className="h-4 w-4" /> Send test
          </h3>
          <div className="space-y-3">
            <Field label="Send from">
              <select
                className={inputClass}
                value={effectiveNumberId}
                onChange={(event) => setNumberId(event.target.value)}
              >
                {senders.length === 0 && <option value="">No enabled number in this WABA</option>}
                {senders.map((number) => (
                  <option key={number.id} value={number.id}>
                    {number.internal_name || number.verified_name || number.display_phone_number} —{" "}
                    {number.display_phone_number}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Recipient">
              <input
                className={inputClass}
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="2010xxxxxxxx"
                inputMode="tel"
              />
            </Field>
            {variables.map((name) => (
              <Field key={name} label={`{{${name}}}`}>
                <input
                  className={inputClass}
                  value={variableValues[name] ?? ""}
                  onChange={(event) =>
                    setVariableValues((current) => ({ ...current, [name]: event.target.value }))
                  }
                />
              </Field>
            ))}
            <Button
              className="w-full"
              onClick={() => void handleSendTest()}
              disabled={sending || template.status !== "approved" || !effectiveNumberId}
            >
              <Send className="mr-2 h-4 w-4" /> {sending ? "Sending…" : "Send approved template"}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all text-right font-medium">{value}</dd>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function CreateTemplateDialog({
  wabas,
  onClose,
  onCreated,
}: {
  wabas: { id: string; label: string }[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const create = useServerFn(createTemplate);
  const [wabaId, setWabaId] = useState(wabas[0]?.id ?? "");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("UTILITY");
  const [language, setLanguage] = useState<(typeof LANGUAGES)[number]>("ar");
  const [header, setHeader] = useState("");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [buttons, setButtons] = useState("");
  const [exampleValues, setExampleValues] = useState("");
  const [advancedComponents, setAdvancedComponents] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const bodyVariables = useMemo(() => placeholdersOf([{ type: "BODY", text: body }]), [body]);
  const examples = useMemo(
    () =>
      exampleValues
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean),
    [exampleValues],
  );

  const components = useMemo<TemplateComponent[]>(() => {
    const result: TemplateComponent[] = [];
    if (header.trim()) result.push({ type: "HEADER", format: "TEXT", text: header.trim() });
    if (body.trim()) {
      result.push({
        type: "BODY",
        text: body.trim(),
        ...(bodyVariables.length > 0
          ? {
              example: {
                body_text: [
                  bodyVariables.map((name, index) => examples[index] ?? `sample_${name}`),
                ],
              },
            }
          : {}),
      });
    }
    if (footer.trim()) result.push({ type: "FOOTER", text: footer.trim() });

    const buttonList = buttons
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    if (buttonList.length > 0) {
      result.push({
        type: "BUTTONS",
        buttons: buttonList.map((text) => ({ type: "QUICK_REPLY", text })),
      });
    }
    return result;
  }, [header, body, footer, buttons, bodyVariables, examples]);

  const parsedAdvanced = useMemo<TemplateComponent[] | null>(() => {
    if (!advancedComponents.trim()) return null;
    try {
      const parsed = JSON.parse(advancedComponents) as unknown;
      return Array.isArray(parsed) ? (parsed as TemplateComponent[]) : null;
    } catch {
      return null;
    }
  }, [advancedComponents]);

  const effectiveComponents = advancedComponents.trim() ? (parsedAdvanced ?? []) : components;

  const submit = async () => {
    if (!wabaId) {
      toast.error("Select a WABA");
      return;
    }
    if (!name.trim()) {
      toast.error("Template name is required");
      return;
    }
    if (advancedComponents.trim() && !parsedAdvanced) {
      toast.error("Advanced components JSON is invalid");
      return;
    }
    if (
      !effectiveComponents.some(
        (component) => String(component.type ?? "").toUpperCase() === "BODY",
      )
    ) {
      toast.error("A BODY component is required");
      return;
    }

    setSubmitting(true);
    try {
      const result = await create({
        data: {
          wabaId,
          name,
          category,
          language,
          components: effectiveComponents,
          allowCategoryChange: true,
        },
      });
      if (!result.ok) throw new Error(result.error ?? "Submission failed");
      toast.success("Template submitted to Meta for review");
      await onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4" /> New message template
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <Field label="WABA">
              <select
                className={inputClass}
                value={wabaId}
                onChange={(event) => setWabaId(event.target.value)}
              >
                {wabas.map((waba) => (
                  <option key={waba.id} value={waba.id}>
                    {waba.label}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name">
                <input
                  className={inputClass}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="service_request_update"
                />
              </Field>
              <Field label="Category">
                <select
                  className={inputClass}
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value as (typeof CATEGORIES)[number])
                  }
                >
                  {CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Language">
                <select
                  className={inputClass}
                  value={language}
                  onChange={(event) =>
                    setLanguage(event.target.value as (typeof LANGUAGES)[number])
                  }
                >
                  {LANGUAGES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Header (optional)">
              <input
                className={inputClass}
                value={header}
                onChange={(event) => setHeader(event.target.value)}
              />
            </Field>
            <Field label="Body">
              <textarea
                className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="مرحبًا {{1}}، تم تحديث حالة الطلب {{2}}."
              />
            </Field>
            {bodyVariables.length > 0 && (
              <Field
                label={`Review examples — one line per variable (${bodyVariables.map((name) => `{{${name}}}`).join(", ")})`}
              >
                <textarea
                  className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={exampleValues}
                  onChange={(event) => setExampleValues(event.target.value)}
                  placeholder={"محمد\nAUF-1024"}
                />
              </Field>
            )}
            <Field label="Footer (optional)">
              <input
                className={inputClass}
                value={footer}
                onChange={(event) => setFooter(event.target.value)}
              />
            </Field>
            <Field label="Quick reply buttons — one per line (optional)">
              <textarea
                className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={buttons}
                onChange={(event) => setButtons(event.target.value)}
                placeholder={"متابعة الطلب\nالتواصل مع الدعم"}
              />
            </Field>
            <Field label="Advanced Meta components JSON (optional — Authentication / media / CTA / Flow / Catalog)">
              <textarea
                className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                value={advancedComponents}
                onChange={(event) => setAdvancedComponents(event.target.value)}
                placeholder='[{"type":"BODY","text":"..."},{"type":"BUTTONS","buttons":[...]}]'
              />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              WhatsApp preview
            </p>
            <Preview components={effectiveComponents} />
            <p className="mt-3 text-xs text-muted-foreground">
              Variables: {placeholdersOf(effectiveComponents).join(", ") || "none"}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit to Meta"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
