import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleAlert, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { Button } from "@/components/ui/button";
import {
  inspectMetaWebhookSubscription,
  reconcileMetaWebhookSubscription,
} from "@/lib/meta/app-webhook.functions";
import { getMetaAppConfig, saveMetaAppConfig } from "@/lib/meta/meta.functions";
import { syncMetaLiveStatus } from "@/lib/meta/live-status.functions";

export const Route = createFileRoute("/_authenticated/meta-app")({
  head: () => ({
    meta: [
      { title: "Meta App — AzWA" },
      {
        name: "description",
        content: "Configure AzWA Meta credentials and WhatsApp webhook subscriptions.",
      },
    ],
  }),
  component: MetaAppPage,
});

type SecretState = {
  verifyToken: boolean;
  appSecret: boolean;
  appAccessToken: boolean;
  systemUserToken: boolean;
};

type WebhookInspection = {
  ok: boolean;
  healthy?: boolean;
  active?: boolean;
  callbackMatches?: boolean;
  missingFields?: readonly string[];
  error?: string;
};

const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20";

type LiveStatus = {
  ok: boolean;
  checkedAt: string;
  token: { ok: boolean; appId: string | null; missingPermissions: readonly string[] } | null;
  webhook: { ok: boolean; healthy?: boolean } | null;
  wabas: readonly { wabaId: string; metaWabaId: string; name: string | null; subscribed: boolean; changed: boolean; error?: string }[];
  errors: readonly string[];
};

function MetaAppPage() {
  const loadConfig = useServerFn(getMetaAppConfig);
  const saveConfig = useServerFn(saveMetaAppConfig);
  const inspectWebhook = useServerFn(inspectMetaWebhookSubscription);
  const reconcileWebhook = useServerFn(reconcileMetaWebhookSubscription);
  const runLiveSync = useServerFn(syncMetaLiveStatus);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingWebhook, setCheckingWebhook] = useState(false);
  const [liveSyncing, setLiveSyncing] = useState(false);
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [appId, setAppId] = useState("");
  const [displayName, setDisplayName] = useState("AzWA");
  const [namespace, setNamespace] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [appAccessToken, setAppAccessToken] = useState("");
  const [systemUserToken, setSystemUserToken] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookStatus, setWebhookStatus] = useState("unconfigured");
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [webhookInspection, setWebhookInspection] = useState<WebhookInspection | null>(null);
  const [configured, setConfigured] = useState<SecretState>({
    verifyToken: false,
    appSecret: false,
    appAccessToken: false,
    systemUserToken: false,
  });

  useEffect(() => {
    let active = true;
    void loadConfig({ data: {} })
      .then((config) => {
        if (!active) return;
        setAppId(config.appId);
        setDisplayName(config.displayName);
        setNamespace(config.namespace);
        setWebhookUrl(config.webhookUrl);
        setWebhookStatus(config.webhookStatus);
        setVerificationStatus(config.verificationStatus);
        setConfigured({
          verifyToken: config.hasVerifyToken,
          appSecret: config.hasAppSecret,
          appAccessToken: config.hasAppAccessToken,
          systemUserToken: config.hasSystemUserToken,
        });
      })
      .catch((error) => {
        if (active) toast.error(error instanceof Error ? error.message : "Unable to load Meta App");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadConfig]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await saveConfig({
        data: {
          appId,
          displayName,
          namespace,
          verifyToken,
          appSecret,
          appAccessToken,
          systemUserToken,
        },
      });
      setWebhookUrl(result.webhookUrl);
      setWebhookStatus("active");
      setConfigured({
        verifyToken: true,
        appSecret: true,
        appAccessToken: true,
        systemUserToken: true,
      });
      setVerifyToken("");
      setAppSecret("");
      setAppAccessToken("");
      setSystemUserToken("");
      toast.success("Meta App configuration saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save Meta App");
    } finally {
      setSaving(false);
    }
  }

  async function checkWebhook(reconcile: boolean) {
    setCheckingWebhook(true);
    try {
      const result = reconcile
        ? await reconcileWebhook({ data: {} })
        : await inspectWebhook({ data: {} });
      setWebhookInspection(result as WebhookInspection);
      if (!result.ok) toast.error(result.error ?? "Meta App webhook check failed");
      else if ("healthy" in result && result.healthy)
        toast.success(reconcile ? "Meta App webhook reconciled" : "Meta App webhook is healthy");
      else toast.warning("Meta App webhook needs reconciliation");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Meta App webhook check failed");
    } finally {
      setCheckingWebhook(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Meta App"
        description="App identity and all Meta secrets are stored server-side in Supabase Vault and are never returned to the browser."
      />

      <form onSubmit={onSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Meta application">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="App ID">
              <input
                className={inputClass}
                value={appId}
                onChange={(event) => setAppId(event.target.value)}
                placeholder="Meta App ID"
                required
                disabled={loading || saving}
              />
            </Field>
            <Field label="Display name">
              <input
                className={inputClass}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="AzWA"
                disabled={loading || saving}
              />
            </Field>
            <Field label="Namespace">
              <input
                className={inputClass}
                value={namespace}
                onChange={(event) => setNamespace(event.target.value)}
                placeholder="azwhatsapp"
                disabled={loading || saving}
              />
            </Field>
            <Field label="Webhook URL">
              <input className={inputClass} value={webhookUrl} readOnly />
            </Field>
          </div>

          <div className="my-6 border-t border-border" />
          <div className="grid gap-4">
            <SecretField
              label="Verify Token"
              value={verifyToken}
              onChange={setVerifyToken}
              configured={configured.verifyToken}
              disabled={loading || saving}
            />
            <SecretField
              label="App Secret"
              value={appSecret}
              onChange={setAppSecret}
              configured={configured.appSecret}
              disabled={loading || saving}
            />
            <SecretField
              label="App Access Token"
              value={appAccessToken}
              onChange={setAppAccessToken}
              configured={configured.appAccessToken}
              disabled={loading || saving}
            />
            <SecretField
              label="System User Token"
              value={systemUserToken}
              onChange={setSystemUserToken}
              configured={configured.systemUserToken}
              disabled={loading || saving}
            />
          </div>
          <div className="mt-6 flex justify-end">
            <Button type="submit" disabled={loading || saving || !appId.trim()}>
              <Save className="size-4" />
              {saving ? "Saving…" : "Save Meta App"}
            </Button>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Credential state">
            <div className="space-y-3 text-sm">
              <CredentialState label="Verify Token" ready={configured.verifyToken} />
              <CredentialState label="App Secret" ready={configured.appSecret} />
              <CredentialState label="App Access Token" ready={configured.appAccessToken} />
              <CredentialState label="System User Token" ready={configured.systemUserToken} />
            </div>
          </Panel>

          <Panel title="App-level WhatsApp webhook">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>Subscription</span>
                <StatusBadgeLike
                  healthy={webhookInspection?.healthy ?? false}
                  checked={webhookInspection !== null}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                DB endpoint: {webhookStatus} · Meta verification:{" "}
                {verificationStatus ?? "not verified"}
              </div>
              {webhookInspection?.missingFields && webhookInspection.missingFields.length > 0 && (
                <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
                  Missing fields: {webhookInspection.missingFields.join(", ")}
                </div>
              )}
              <div className="grid gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={checkingWebhook || !configured.appAccessToken}
                  onClick={() => checkWebhook(false)}
                >
                  <RefreshCw className="size-4" /> Inspect Meta subscription
                </Button>
                <Button
                  type="button"
                  disabled={
                    checkingWebhook || !configured.appAccessToken || !configured.verifyToken
                  }
                  onClick={() => checkWebhook(true)}
                >
                  <ShieldCheck className="size-4" /> Reconcile App webhook
                </Button>
              </div>
            </div>
          </Panel>
        </div>
      </form>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function SecretField({
  label,
  value,
  onChange,
  configured,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  configured: boolean;
  disabled: boolean;
}) {
  return (
    <Field label={label}>
      <input
        type="password"
        autoComplete="new-password"
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={configured ? "Configured — leave blank to keep current value" : "Required"}
        disabled={disabled}
      />
    </Field>
  );
}

function CredentialState({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
      <span>{label}</span>
      <span
        className={`flex items-center gap-1.5 text-xs font-medium ${ready ? "text-success" : "text-muted-foreground"}`}
      >
        {ready ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}
        {ready ? "Configured" : "Missing"}
      </span>
    </div>
  );
}

function StatusBadgeLike({ healthy, checked }: { healthy: boolean; checked: boolean }) {
  return (
    <span
      className={`flex items-center gap-1.5 text-xs font-medium ${checked && healthy ? "text-success" : "text-muted-foreground"}`}
    >
      {checked && healthy ? (
        <CheckCircle2 className="size-4" />
      ) : (
        <CircleAlert className="size-4" />
      )}
      {!checked ? "Not checked" : healthy ? "Healthy" : "Needs reconcile"}
    </span>
  );
}
