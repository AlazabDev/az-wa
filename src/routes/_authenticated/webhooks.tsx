import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  Edit2,
  Eye,
  EyeOff,
  HardDrive,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  RotateCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Webhook,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { StatusBadge } from "@/components/azwa/status-badge";
import { RecordTable } from "@/components/azwa/record-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMetaApps } from "@/lib/meta/inventory-data";
import { META_WEBHOOK_CALLBACK_URL, META_WEBHOOK_INTERNAL_PATH } from "@/lib/meta/public-config";
import {
  deleteWebhookEndpoint,
  loadWebhookAdminContext,
  reconcileMetaWebhook,
  setWebhookEndpointStatus,
  testMinioConnectivity,
  testWebhookChallenge,
  upsertWebhookEndpoint,
  type WebhookEndpointRow,
  type WebhookAdminContext,
} from "@/lib/meta/webhook-admin.functions";

export const Route = createFileRoute("/_authenticated/webhooks")({
  head: () => ({
    meta: [
      { title: "Webhooks — AzWA" },
      {
        name: "description",
        content:
          "Manage Meta webhook endpoints, verify tokens, app secrets and MinIO media storage — all configured server-side without exposing secrets to the browser.",
      },
    ],
  }),
  component: WebhooksPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      {hint && <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>}
    </label>
  );
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        toast.success(label ? `${label} copied` : "Copied");
      }}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      title="Copy"
    >
      <Copy className="h-3 w-3" />
      Copy
    </button>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function StatusDot({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="inline-block h-2 w-2 rounded-full bg-muted" />;
  return ok ? (
    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
  ) : (
    <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
  );
}

// ─── MinIO Status Card ────────────────────────────────────────────────────────

function MinioStatusCard({
  minio,
  onTest,
  testing,
}: {
  minio: WebhookAdminContext["minio"];
  onTest: () => void;
  testing: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Milano MinIO Storage</h2>
            <p className="text-xs text-muted-foreground">
              Incoming WhatsApp media is archived here automatically.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onTest} disabled={testing}>
          {testing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Activity className="mr-2 h-4 w-4" />
          )}
          Test connection
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Endpoint",
            value: minio.endpoint || "Not configured",
            mono: true,
          },
          { label: "Bucket", value: minio.bucket || "az-bk-whatsapp", mono: true },
          { label: "Region", value: minio.region || "us-east-1", mono: true },
          {
            label: "SSL",
            value: minio.useSSL ? "Enabled" : "Disabled",
            mono: false,
          },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {item.label}
            </p>
            <p
              className={`mt-1 text-sm font-medium truncate ${item.mono ? "font-mono text-xs" : ""}`}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <StatusDot ok={minio.configured ? minio.endpointReachable : false} />
        <span className="text-xs text-muted-foreground">
          {!minio.configured
            ? "Not configured — set MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY"
            : minio.endpointReachable === null
              ? "Connectivity not yet tested"
              : minio.endpointReachable
                ? "Endpoint reachable"
                : "Endpoint unreachable — check server connectivity"}
        </span>
      </div>

      <div className="mt-3 rounded-md border border-border/60 bg-muted/10 p-3 text-xs text-muted-foreground space-y-1">
        <p>
          Object path pattern:{" "}
          <span className="font-mono text-foreground">
            {minio.bucket}/&lt;year&gt;/&lt;month&gt;/&lt;type&gt;/&lt;media-id&gt;.&lt;ext&gt;
          </span>
        </p>
        <p>
          Presigned URL expiry: <span className="font-mono text-foreground">15 minutes</span> (UI
          download), <span className="font-mono text-foreground">7 days</span> (max)
        </p>
        <p>
          Pipeline: Meta CDN → AzWA server → MinIO bucket (no binary passes through the browser)
        </p>
      </div>
    </section>
  );
}

// ─── Endpoint Form Dialog ─────────────────────────────────────────────────────

function EndpointFormDialog({
  initial,
  metaApps,
  onClose,
  onSaved,
}: {
  initial?: WebhookEndpointRow | null;
  metaApps: { id: string; meta_app_id: string; name: string | null }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const doUpsert = useServerFn(upsertWebhookEndpoint);
  const isEdit = Boolean(initial);

  const [metaAppId, setMetaAppId] = useState(initial?.meta_app_id ?? metaApps[0]?.id ?? "");
  const [url, setUrl] = useState(initial?.url ?? META_WEBHOOK_CALLBACK_URL);
  const [endpointType, setEndpointType] = useState(initial?.endpoint_type ?? "meta_whatsapp");
  const [verifyToken, setVerifyToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [showVerify, setShowVerify] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [status, setStatus] = useState<"active" | "inactive">(
    initial?.status === "inactive" ? "inactive" : "active",
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!url.trim()) {
      toast.error("Webhook URL is required");
      return;
    }
    if (!metaAppId) {
      toast.error("Select a Meta App");
      return;
    }
    if (!isEdit && !verifyToken.trim()) {
      toast.error("Verify token is required for new endpoints");
      return;
    }
    if (!isEdit && !appSecret.trim()) {
      toast.error("App secret is required for new endpoints");
      return;
    }

    setSaving(true);
    try {
      await doUpsert({
        data: {
          endpointId: initial?.id ?? null,
          metaAppId,
          url: url.trim(),
          endpointType,
          verifyToken: verifyToken.trim() || null,
          appSecret: appSecret.trim() || null,
          status,
        },
      });
      toast.success(isEdit ? "Endpoint updated" : "Endpoint created");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save endpoint");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="flex max-h-[95vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-background shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-6 py-4">
          <div className="flex items-center gap-3">
            <Webhook className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold">
                {isEdit ? "Edit webhook endpoint" : "New webhook endpoint"}
              </h2>
              <p className="text-xs text-muted-foreground">
                Secrets are encrypted in Vault — never stored in plain text.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <Field label="Callback URL" hint="Must match exactly what is registered in the Meta App.">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={META_WEBHOOK_CALLBACK_URL}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Meta App">
              <select
                className={inputClass}
                value={metaAppId}
                onChange={(e) => setMetaAppId(e.target.value)}
              >
                <option value="">Select Meta App…</option>
                {metaApps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name ?? app.meta_app_id}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Endpoint type">
              <select
                className={inputClass}
                value={endpointType}
                onChange={(e) => setEndpointType(e.target.value)}
              >
                <option value="meta_whatsapp">meta_whatsapp</option>
                <option value="other">other</option>
              </select>
            </Field>
          </div>

          {/* Verify Token */}
          <Field
            label={isEdit ? "Verify token (leave blank to keep existing)" : "Verify token *"}
            hint="Sent by Meta during webhook verification (hub.verify_token). Stored encrypted in Vault."
          >
            <div className="relative">
              <input
                className={`${inputClass} pr-10 font-mono`}
                type={showVerify ? "text" : "password"}
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                placeholder={
                  isEdit
                    ? initial?.has_verify_token
                      ? `Current: ••••${initial.verify_token_fingerprint ?? ""}…`
                      : "No token set"
                    : "az_webhook_xxxx…"
                }
                autoComplete="off"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowVerify((v) => !v)}
                tabIndex={-1}
              >
                {showVerify ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          {/* App Secret */}
          <Field
            label={
              isEdit
                ? "App secret (leave blank to keep existing)"
                : "App secret (X-Hub-Signature-256) *"
            }
            hint="Used to validate HMAC-SHA256 signatures on incoming webhook POSTs. Stored encrypted in Vault."
          >
            <div className="relative">
              <input
                className={`${inputClass} pr-10 font-mono`}
                type={showSecret ? "text" : "password"}
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder={
                  isEdit
                    ? initial?.has_app_secret
                      ? `Current: ••••${initial.app_secret_fingerprint ?? ""}…`
                      : "No secret set"
                    : "f0604…"
                }
                autoComplete="off"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowSecret((v) => !v)}
                tabIndex={-1}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <Field label="Status">
            <select
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>

          {/* Current values hint for edit */}
          {isEdit && (
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs space-y-1 text-muted-foreground">
              <p className="font-semibold text-foreground mb-1">Current configuration</p>
              <p>
                Verify token:{" "}
                {initial?.has_verify_token ? (
                  <span className="text-emerald-600">
                    ✓ Set (fingerprint: {initial.verify_token_fingerprint ?? "—"})
                  </span>
                ) : (
                  <span className="text-destructive">✗ Not set</span>
                )}
              </p>
              <p>
                App secret:{" "}
                {initial?.has_app_secret ? (
                  <span className="text-emerald-600">
                    ✓ Set (fingerprint: {initial.app_secret_fingerprint ?? "—"})
                  </span>
                ) : (
                  <span className="text-destructive">✗ Not set</span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-muted/30 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Create endpoint"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Endpoint Card ────────────────────────────────────────────────────────────

function EndpointCard({
  endpoint,
  onEdit,
  onRefresh,
}: {
  endpoint: WebhookEndpointRow;
  onEdit: (ep: WebhookEndpointRow) => void;
  onRefresh: () => void;
}) {
  const doSetStatus = useServerFn(setWebhookEndpointStatus);
  const doDelete = useServerFn(deleteWebhookEndpoint);
  const doTest = useServerFn(testWebhookChallenge);

  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    detail: string;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function handleToggle() {
    setBusy(true);
    try {
      const nextStatus = endpoint.status === "active" ? "inactive" : "active";
      await doSetStatus({ data: { endpointId: endpoint.id, status: nextStatus } });
      toast.success(`Endpoint ${nextStatus}`);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this webhook endpoint? This will also revoke its credentials."))
      return;
    setBusy(true);
    try {
      await doDelete({ data: { endpointId: endpoint.id } });
      toast.success("Endpoint deleted and credentials revoked");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    setTestResult(null);
    try {
      const result = await doTest({ data: { endpointId: endpoint.id } });
      setTestResult({ ok: result.ok, detail: result.detail });
      if (result.ok) toast.success("Challenge passed");
      else toast.error(`Challenge failed: ${result.detail}`);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setBusy(false);
    }
  }

  const isActive = endpoint.status === "active";
  const isVerified = endpoint.verification_status === "verified";

  return (
    <div
      className={`rounded-xl border shadow-sm transition-all ${
        isActive ? "border-border bg-card" : "border-border/50 bg-muted/20 opacity-70"
      }`}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-start gap-3 p-4">
        {/* Status indicator */}
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            isActive ? "bg-emerald-100 text-emerald-600" : "bg-muted text-muted-foreground"
          }`}
        >
          <Webhook className="h-4 w-4" />
        </div>

        {/* Main info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-foreground break-all">
              {endpoint.url}
            </span>
            <CopyButton value={endpoint.url} label="URL" />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="capitalize">{endpoint.endpoint_type.replace(/_/g, " ")}</span>
            <span>·</span>
            <span>{endpoint.meta_app_name ?? endpoint.meta_app_id}</span>
            <span>·</span>
            <StatusBadge value={endpoint.status} />
            {isVerified && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <ShieldCheck className="h-3 w-3" />
                  Verified
                </span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={busy}
            onClick={handleTest}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            Test
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={busy}
            onClick={() => onEdit(endpoint)}
            title="Edit"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className={`h-8 w-8 ${isActive ? "text-amber-600" : "text-emerald-600"}`}
            disabled={busy}
            onClick={handleToggle}
            title={isActive ? "Deactivate" : "Activate"}
          >
            <Power className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:bg-destructive/10"
            disabled={busy}
            onClick={handleDelete}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Test result banner */}
      {testResult && (
        <div
          className={`mx-4 mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
            testResult.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {testResult.ok ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span>{testResult.detail}</span>
          <button
            className="ml-auto shrink-0 opacity-60 hover:opacity-100"
            onClick={() => setTestResult(null)}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border/60 px-4 pb-4 pt-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            {[
              {
                label: "Verify token",
                value: endpoint.has_verify_token ? (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Set · fingerprint:{" "}
                    <span className="font-mono">{endpoint.verify_token_fingerprint ?? "—"}</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-destructive">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Not set
                  </span>
                ),
              },
              {
                label: "App secret",
                value: endpoint.has_app_secret ? (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Set · fingerprint:{" "}
                    <span className="font-mono">{endpoint.app_secret_fingerprint ?? "—"}</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-destructive">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Not set
                  </span>
                ),
              },
              {
                label: "Verification",
                value: <StatusBadge value={endpoint.verification_status ?? "pending"} />,
              },
              {
                label: "Last event",
                value: formatDate(endpoint.last_event_at),
              },
              {
                label: "Last success",
                value: formatDate(endpoint.last_success_at),
              },
              {
                label: "Last failure",
                value: (
                  <span className={endpoint.last_failure_at ? "text-destructive" : ""}>
                    {formatDate(endpoint.last_failure_at)}
                  </span>
                ),
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-md border border-border/60 bg-muted/20 p-2.5"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {item.label}
                </p>
                <div className="font-medium">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-md border border-border/60 bg-muted/10 p-2.5 font-mono text-[11px] text-muted-foreground">
            <p>
              Internal route: <span className="text-foreground">{META_WEBHOOK_INTERNAL_PATH}</span>
            </p>
            <p className="mt-0.5">
              Endpoint ID: <span className="text-foreground">{endpoint.id}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function WebhooksPage() {
  const queryClient = useQueryClient();
  const { data: metaApps = [] } = useMetaApps();

  const loadCtx = useServerFn(loadWebhookAdminContext);
  const doReconcile = useServerFn(reconcileMetaWebhook);
  const doTestMinio = useServerFn(testMinioConnectivity);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<WebhookEndpointRow | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [testingMinio, setTestingMinio] = useState(false);
  const [search, setSearch] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const {
    data: ctx,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["webhook-admin-context"],
    queryFn: () => loadCtx({ data: {} }),
    refetchInterval: 30_000,
  });

  const endpoints = ctx?.endpoints ?? [];

  async function handleReconcile() {
    setReconciling(true);
    try {
      const result = await doReconcile({ data: {} });
      if (result.ok) {
        toast.success(result.changed ? "Meta App webhook reconciled" : "Webhook already healthy");
      } else {
        toast.error(result.error ?? "Reconcile failed");
      }
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reconcile failed");
    } finally {
      setReconciling(false);
    }
  }

  async function handleTestMinio() {
    setTestingMinio(true);
    try {
      const result = await doTestMinio({ data: {} });
      if (result.ok) toast.success(`MinIO reachable: ${result.detail}`);
      else toast.error(`MinIO unreachable: ${result.detail}`);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "MinIO test failed");
    } finally {
      setTestingMinio(false);
    }
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["webhook-admin-context"] });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description="Manage Meta webhook endpoints, verify tokens, app secrets, and MinIO media storage. Secrets never leave the server."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReconcile}
              disabled={reconciling || isLoading}
            >
              {reconciling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="mr-2 h-4 w-4" />
              )}
              Reconcile Meta App
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New endpoint
            </Button>
          </div>
        }
      />

      {/* Callback URL info panel */}
      <Panel title="Production callback URL">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Meta-registered callback
            </dt>
            <dd className="mt-1.5 flex items-center gap-2" dir="ltr">
              <span className="font-mono text-sm text-foreground break-all">
                {META_WEBHOOK_CALLBACK_URL}
              </span>
              <CopyButton value={META_WEBHOOK_CALLBACK_URL} label="Callback URL" />
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Internal route (TanStack Start)
            </dt>
            <dd className="mt-1.5 font-mono text-sm text-foreground" dir="ltr">
              {META_WEBHOOK_INTERNAL_PATH}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Env fallback — verify token
            </dt>
            <dd className="mt-1 text-xs">
              {ctx?.verifyTokenEnv ? (
                <span className="text-emerald-600">{ctx.verifyTokenEnv}</span>
              ) : (
                <span className="text-muted-foreground">
                  Not set — using Vault credentials only
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Env fallback — app secret
            </dt>
            <dd className="mt-1 text-xs">
              {ctx?.appSecretEnv ? (
                <span className="text-emerald-600">{ctx.appSecretEnv}</span>
              ) : (
                <span className="text-muted-foreground">
                  Not set — using Vault credentials only
                </span>
              )}
            </dd>
          </div>
        </div>
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <strong>How signature validation works:</strong> Every incoming POST from Meta is verified
          with HMAC-SHA256 using the <code>app_secret</code> credential stored in Vault. Requests
          without a valid <code>X-Hub-Signature-256</code> header are rejected with HTTP 401 before
          any payload is processed.
        </div>
      </Panel>

      {/* MinIO storage */}
      {ctx ? (
        <MinioStatusCard minio={ctx.minio} onTest={handleTestMinio} testing={testingMinio} />
      ) : null}

      {/* Endpoint management */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            Webhook endpoints
            {endpoints.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {endpoints.length} configured
              </span>
            )}
          </h2>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search URL or app…"
            className="w-56 h-8 text-xs"
          />
        </div>

        {isLoading ? (
          <div className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading endpoints…
          </div>
        ) : endpoints.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <Webhook className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="font-medium text-sm">No webhook endpoints configured</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create an endpoint to start receiving WhatsApp events.
            </p>
            <Button className="mt-4" size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create first endpoint
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {endpoints
              .filter((ep) => {
                const q = search.trim().toLowerCase();
                if (!q) return true;
                return [ep.url, ep.meta_app_name, ep.endpoint_type, ep.status].some((v) =>
                  String(v ?? "")
                    .toLowerCase()
                    .includes(q),
                );
              })
              .map((ep) => (
                <EndpointCard
                  key={ep.id}
                  endpoint={ep}
                  onEdit={setEditing}
                  onRefresh={invalidate}
                />
              ))}
          </div>
        )}
      </section>

      {/* Webhook event audit log */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="text-sm font-semibold self-center">Webhook event audit log</h2>
          <div className="flex flex-wrap gap-2 ml-auto">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="WABA, Phone ID, request ID…"
                className="pr-9 h-9 w-52 text-sm"
                dir="rtl"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All statuses</option>
              <option value="200">200 — OK</option>
              <option value="401">401 — Unauthorized</option>
              <option value="400">400 — Bad request</option>
              <option value="403">403 — Forbidden</option>
            </select>
            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All event types</option>
              <option value="messages">messages</option>
              <option value="account_update">account_update</option>
              <option value="message_template_status_update">template status</option>
              <option value="phone_number_quality_update">quality update</option>
              <option value="flows">flows</option>
              <option value="security">security</option>
            </select>
          </div>
        </div>

        <RecordTable
          table="meta_webhook_request_audit"
          title="Incoming Meta requests"
          orderBy="received_at"
          limit={100}
          searchText={search}
          searchKeys={["meta_waba_id", "meta_phone_number_id", "request_id", "event_type"]}
          filters={{
            http_status: statusFilter || undefined,
            event_type: eventTypeFilter || undefined,
          }}
          columns={[
            { key: "received_at", label: "Time", kind: "date" },
            { key: "method", label: "Method", kind: "status" },
            { key: "event_type", label: "Event" },
            { key: "verification_type", label: "Auth type" },
            { key: "verification_valid", label: "Valid", kind: "bool" },
            { key: "http_status", label: "HTTP" },
            { key: "meta_phone_number_id", label: "Phone ID", kind: "mono" },
            { key: "meta_waba_id", label: "WABA ID", kind: "mono" },
            { key: "request_id", label: "Request ID", kind: "mono" },
          ]}
          emptyLabel="No Meta webhook requests recorded yet."
        />

        <RecordTable
          table="webhook_events"
          title="Processed webhook events"
          orderBy="received_at"
          limit={100}
          columns={[
            { key: "received_at", label: "Received", kind: "date" },
            { key: "event_type", label: "Type" },
            { key: "field", label: "Field" },
            { key: "meta_phone_number_id", label: "Phone ID", kind: "mono" },
            { key: "meta_waba_id", label: "WABA ID", kind: "mono" },
            { key: "signature_valid", label: "Signature", kind: "bool" },
            { key: "status", label: "Status", kind: "status" },
            { key: "error_message", label: "Error" },
          ]}
        />

        <RecordTable
          table="unmapped_number_events"
          title="Unmapped number events"
          orderBy="received_at"
          emptyLabel="No events from unknown numbers."
          columns={[
            { key: "received_at", label: "Received", kind: "date" },
            { key: "meta_phone_number_id", label: "Phone ID", kind: "mono" },
            { key: "display_phone_number", label: "Number" },
            { key: "meta_waba_id", label: "WABA ID", kind: "mono" },
            { key: "resolved", label: "Resolved", kind: "bool" },
          ]}
        />
      </div>

      {/* Dialogs */}
      {creating && (
        <EndpointFormDialog
          metaApps={metaApps}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            invalidate();
          }}
        />
      )}
      {editing && (
        <EndpointFormDialog
          initial={editing}
          metaApps={metaApps}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}
