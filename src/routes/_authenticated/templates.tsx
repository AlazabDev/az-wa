import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, PageHeader, Panel } from "@/components/azwa/page-header";
import { StatusBadge } from "@/components/azwa/status-badge";
import { Button } from "@/components/ui/button";
import { useNumbers, useWabas } from "@/lib/azwa-data";
import {
  bodyText,
  buttonsOf,
  componentOf,
  placeholdersOf,
  useTemplates,
  type Template,
  type TemplateComponent,
} from "@/lib/azwa-templates";
import { createTemplate, deleteTemplate, syncTemplates } from "@/lib/meta/templates.functions";
import { useScope } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({
    meta: [
      { title: "Templates — AzWA" },
      {
        name: "description",
        content:
          "Manage the WhatsApp message template library of every WABA: sync from Meta, review approval status and submit new templates.",
      },
      { property: "og:title", content: "Templates — AzWA" },
      {
        property: "og:description",
        content: "WhatsApp template library management across all business accounts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TemplatesPage,
});

const inputClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20";

const CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"];
const LANGUAGES = ["ar", "en", "en_US", "ar_EG"];

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

  const wabaName = (id: string) => {
    const w = wabas.find((x) => x.id === id);
    return w?.name ?? w?.meta_waba_id ?? "—";
  };

  const scopedWabaIds = useMemo(() => {
    if (scope.kind === "all") return null;
    if (scope.kind === "waba") return new Set([scope.id]);
    if (scope.kind === "business")
      return new Set(wabas.filter((w) => w.business_portfolio_id === scope.id).map((w) => w.id));
    const number = numbers.find((n) => n.id === scope.id);
    return new Set(number ? [number.waba_id] : []);
  }, [scope, wabas, numbers]);

  const visible = templates.filter((t) => {
    if (scopedWabaIds && !scopedWabaIds.has(t.waba_id)) return false;
    if (status !== "all" && t.status !== status) return false;
    if (category !== "all" && t.category !== category) return false;
    if (wabaFilter !== "all" && t.waba_id !== wabaFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return t.name.toLowerCase().includes(q) || bodyText(t.components).toLowerCase().includes(q);
  });

  const counts = useMemo(() => {
    const base = { approved: 0, pending: 0, rejected: 0, other: 0 };
    for (const t of templates) {
      if (t.status in base) base[t.status as keyof typeof base] += 1;
      else base.other += 1;
    }
    return base;
  }, [templates]);

  const syncTargets = () => {
    if (!scopedWabaIds) return wabas.map((w) => w.id);
    return [...scopedWabaIds];
  };

  const handleSync = async () => {
    const targets = syncTargets();
    if (!targets.length) return toast.error("No WABA in the current scope");
    setSyncing(true);
    try {
      let total = 0;
      const failures: string[] = [];
      for (const id of targets) {
        const res = await sync({ data: { wabaId: id } });
        if (res.ok) total += res.synced ?? 0;
        else failures.push(`${wabaName(id)}: ${res.error}`);
      }
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      if (failures.length) toast.error(failures[0] as string);
      else toast.success(`${total} template(s) synced from Meta`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (template: Template) => {
    if (!window.confirm(`Delete template "${template.name}" on Meta as well?`)) return;
    try {
      const res = await remove({ data: { templateId: template.id } });
      if (!res.ok) throw new Error(res.error ?? "Delete failed");
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      setSelected(null);
      toast.success("Template deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <>
      <PageHeader
        title="Message Templates"
        description="Every WABA owns its own template library. Sync pulls the current approval state from Meta; new templates are submitted for review immediately."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync from Meta"}
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
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
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold">{c.value}</p>
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
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className={`${inputClass} w-[150px]`}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            {["approved", "pending", "rejected", "paused", "disabled", "deleted", "unknown"].map(
              (s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ),
            )}
          </select>
          <select
            className={`${inputClass} w-[160px]`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className={`${inputClass} w-[200px]`}
            value={wabaFilter}
            onChange={(e) => setWabaFilter(e.target.value)}
          >
            <option value="all">All WABAs</option>
            {wabas.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name ?? w.meta_waba_id}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            title="No templates yet"
            hint="Run “Sync from Meta” to import the existing library, or create a new template."
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
                {visible.map((t) => (
                  <tr
                    key={t.id}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40"
                    onClick={() => setSelected(t)}
                  >
                    <td className="py-2 pr-4 font-mono text-xs">{t.name}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {wabaName(t.waba_id)}
                    </td>
                    <td className="py-2 pr-4 text-xs">{t.category}</td>
                    <td className="py-2 pr-4 text-xs">{t.language}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge value={t.status} />
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {t.quality_rating ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {placeholdersOf(t.components).length}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(t);
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
          template={selected}
          wabaName={wabaName(selected.waba_id)}
          onClose={() => setSelected(null)}
        />
      )}

      {creating && (
        <CreateTemplateDialog
          wabas={wabas.map((w) => ({ id: w.id, label: w.name ?? w.meta_waba_id }))}
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
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="max-w-[280px] rounded-xl bg-card p-3 shadow-sm">
        {header?.text && <p className="mb-1 text-sm font-semibold">{header.text}</p>}
        {header?.format && header.format !== "TEXT" && (
          <p className="mb-1 text-[11px] uppercase text-muted-foreground">{header.format}</p>
        )}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{bodyText(components) || "…"}</p>
        {footer?.text && <p className="mt-2 text-[11px] text-muted-foreground">{footer.text}</p>}
        {buttonsOf(components).length > 0 && (
          <div className="mt-2 space-y-1 border-t border-border pt-2">
            {buttonsOf(components).map((b, i) => (
              <p key={i} className="text-center text-xs font-medium text-primary">
                {b.text}
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
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
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

        <dl className="mt-4 space-y-2 text-xs">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Meta template ID</dt>
            <dd className="font-mono">{template.meta_template_id ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Variables</dt>
            <dd className="font-mono">{placeholdersOf(template.components).join(", ") || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Last synced</dt>
            <dd>
              {template.last_synced_at
                ? new Date(template.last_synced_at).toLocaleString()
                : "never"}
            </dd>
          </div>
        </dl>

        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Raw components JSON
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-[11px]">
            {JSON.stringify(template.components, null, 2)}
          </pre>
        </details>
      </aside>
    </div>
  );
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
  const [category, setCategory] = useState("UTILITY");
  const [language, setLanguage] = useState("ar");
  const [header, setHeader] = useState("");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [buttons, setButtons] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const components: TemplateComponent[] = [];
  if (header.trim()) components.push({ type: "HEADER", format: "TEXT", text: header.trim() });
  if (body.trim()) components.push({ type: "BODY", text: body.trim() });
  if (footer.trim()) components.push({ type: "FOOTER", text: footer.trim() });
  const buttonList = buttons
    .split("\n")
    .map((b) => b.trim())
    .filter(Boolean);
  if (buttonList.length)
    components.push({
      type: "BUTTONS",
      buttons: buttonList.map((text) => ({ type: "QUICK_REPLY", text })),
    });

  const submit = async () => {
    if (!wabaId) return toast.error("Select a WABA");
    if (!body.trim()) return toast.error("The body text is required");
    setSubmitting(true);
    try {
      const res = await create({
        data: { wabaId, name, category, language, components },
      });
      if (!res.ok) throw new Error(res.error ?? "Submission failed");
      toast.success("Template submitted to Meta for review");
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4" /> New message template
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <Field label="WABA">
              <select
                className={inputClass}
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
              >
                {wabas.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Name (lowercase, underscores)">
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="maintenance_reminder"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <select
                  className={inputClass}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Language">
                <select
                  className={inputClass}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Header text (optional)">
              <input
                className={inputClass}
                value={header}
                onChange={(e) => setHeader(e.target.value)}
              />
            </Field>
            <Field label="Body — use {{1}}, {{2}} for variables">
              <textarea
                className={`${inputClass} h-28 py-2`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </Field>
            <Field label="Footer (optional)">
              <input
                className={inputClass}
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
              />
            </Field>
            <Field label="Quick reply buttons (one per line, optional)">
              <textarea
                className={`${inputClass} h-20 py-2`}
                value={buttons}
                onChange={(e) => setButtons(e.target.value)}
              />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Preview</p>
            <Preview components={components} />
            <p className="mt-3 text-xs text-muted-foreground">
              Variables detected: {placeholdersOf(components).join(", ") || "none"}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit for review"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
