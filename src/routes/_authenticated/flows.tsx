import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GitBranch, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { StatusBadge } from "@/components/azwa/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNumbers, useWabas } from "@/lib/azwa-data";
import {
  createFlow,
  deleteDraftFlow,
  deprecateFlow,
  publishFlow,
  syncWhatsappFlows,
  updateFlowMetadata,
  uploadFlowJson,
} from "@/lib/meta/flows.functions";
import { useWhatsappFlows } from "@/lib/meta/inventory-data";
import { useScope } from "@/lib/scope";

const FLOW_CATEGORIES = [
  "SIGN_UP",
  "SIGN_IN",
  "APPOINTMENT_BOOKING",
  "LEAD_GENERATION",
  "CONTACT_US",
  "CUSTOMER_SUPPORT",
  "SURVEY",
  "OTHER",
] as const;

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20";

export const Route = createFileRoute("/_authenticated/flows")({
  head: () => ({
    meta: [
      { title: "WhatsApp Flows — AzWA" },
      {
        name: "description",
        content:
          "Create, clone, edit, validate, publish and reconcile WABA-scoped WhatsApp Flows.",
      },
    ],
  }),
  component: WhatsappFlowsPage,
});

function WhatsappFlowsPage() {
  const { scope } = useScope();
  const { data: flows = [] } = useWhatsappFlows();
  const { data: wabas = [] } = useWabas();
  const { data: numbers = [] } = useNumbers();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [createWabaId, setCreateWabaId] = useState("");
  const [createName, setCreateName] = useState("");
  const [createCategory, setCreateCategory] = useState<string>("OTHER");
  const [createEndpoint, setCreateEndpoint] = useState("");
  const [cloneFlowId, setCloneFlowId] = useState("");
  const [jsonFlowId, setJsonFlowId] = useState<string | null>(null);
  const [flowJson, setFlowJson] = useState("");
  const [editFlowId, setEditFlowId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<string>("OTHER");
  const [editEndpoint, setEditEndpoint] = useState("");

  const queryClient = useQueryClient();
  const sync = useServerFn(syncWhatsappFlows);
  const create = useServerFn(createFlow);
  const updateMetadata = useServerFn(updateFlowMetadata);
  const uploadJson = useServerFn(uploadFlowJson);
  const publish = useServerFn(publishFlow);
  const deprecate = useServerFn(deprecateFlow);
  const removeDraft = useServerFn(deleteDraftFlow);

  const visibleWabaIds = useMemo(() => {
    if (scope.kind === "all" || !scope.id) return new Set(wabas.map((w) => w.id));
    if (scope.kind === "business") {
      return new Set(wabas.filter((w) => w.business_portfolio_id === scope.id).map((w) => w.id));
    }
    if (scope.kind === "waba") return new Set([scope.id]);
    const number = numbers.find((item) => item.id === scope.id);
    return new Set(number ? [number.waba_id] : []);
  }, [numbers, scope, wabas]);

  const visibleWabas = useMemo(
    () => wabas.filter((waba) => visibleWabaIds.has(waba.id) && waba.status === "active"),
    [visibleWabaIds, wabas],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return flows.filter((flow) => {
      if (!visibleWabaIds.has(flow.waba_id)) return false;
      if (!needle) return true;
      return [
        flow.name,
        flow.meta_flow_id,
        flow.status,
        flow.json_version,
        flow.data_api_version,
        flow.endpoint_uri,
        ...(flow.categories ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [flows, q, visibleWabaIds]);

  async function invalidateFlows() {
    await queryClient.invalidateQueries({ queryKey: ["whatsapp_flows"] });
  }

  async function refreshAll() {
    setBusy("sync");
    try {
      let synced = 0;
      for (const wabaId of visibleWabaIds) {
        const result = await sync({ data: { wabaId } });
        if (!result.ok) throw new Error(result.error);
        synced += result.synced;
      }
      toast.success(`WhatsApp Flows synced: ${synced}`);
      await invalidateFlows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Flow sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function createDraft() {
    const wabaId = createWabaId || visibleWabas[0]?.id;
    if (!wabaId || !createName.trim()) {
      toast.error("Choose a WABA and enter a Flow name");
      return;
    }
    setBusy("create");
    try {
      const result = await create({
        data: {
          wabaId,
          name: createName,
          categories: [createCategory],
          endpointUri: createEndpoint,
          cloneFlowId,
        },
      });
      if (!result.ok) throw new Error(result.error);
      toast.success(`Flow created: ${result.metaFlowId}`);
      setCreateName("");
      setCreateEndpoint("");
      setCloneFlowId("");
      await invalidateFlows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create Flow");
    } finally {
      setBusy(null);
    }
  }

  async function saveMetadata() {
    if (!editFlowId || !editName.trim()) return;
    setBusy(`edit:${editFlowId}`);
    try {
      const result = await updateMetadata({
        data: {
          flowId: editFlowId,
          name: editName,
          categories: [editCategory],
          endpointUri: editEndpoint,
        },
      });
      if (!result.ok) throw new Error(result.error);
      toast.success("Flow metadata updated");
      setEditFlowId(null);
      await invalidateFlows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update Flow");
    } finally {
      setBusy(null);
    }
  }

  async function uploadJsonAsset() {
    if (!jsonFlowId || !flowJson.trim()) return;
    setBusy(`json:${jsonFlowId}`);
    try {
      const result = await uploadJson({ data: { flowId: jsonFlowId, flowJson } });
      if (!result.ok) throw new Error(result.error);
      const count = result.validationErrorCount;
      if (count > 0) toast.error(`Flow JSON uploaded with ${count} validation issue(s)`);
      else toast.success("Flow JSON uploaded and validated");
      await invalidateFlows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to upload Flow JSON");
    } finally {
      setBusy(null);
    }
  }

  async function mutate(id: string, action: "publish" | "deprecate" | "delete") {
    setBusy(id);
    try {
      const result =
        action === "publish"
          ? await publish({ data: { flowId: id } })
          : action === "deprecate"
            ? await deprecate({ data: { flowId: id } })
            : await removeDraft({ data: { flowId: id } });
      if (!result.ok) throw new Error(result.error);
      toast.success(`Flow ${action} completed`);
      await invalidateFlows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Unable to ${action} flow`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="WhatsApp Flows"
        description="Graph API v26 control plane: create or clone a draft, upload flow.json, resolve validation errors, publish, deprecate and reconcile from Meta."
        actions={
          <div className="flex gap-2">
            <Input
              className="w-64"
              placeholder="Search flow, category, ID…"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
            <Button onClick={refreshAll} disabled={busy !== null}>
              <RefreshCw className="size-4" /> {busy === "sync" ? "Syncing…" : "Sync Flows"}
            </Button>
          </div>
        }
      />

      <Panel title="Create or clone Flow">
        <div className="grid gap-3 lg:grid-cols-5">
          <select
            className={selectClass}
            value={createWabaId}
            onChange={(event) => setCreateWabaId(event.target.value)}
            disabled={busy !== null}
          >
            <option value="">Select WABA</option>
            {visibleWabas.map((waba) => (
              <option key={waba.id} value={waba.id}>
                {waba.name ?? waba.meta_waba_id}
              </option>
            ))}
          </select>
          <Input
            placeholder="Flow name"
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
            disabled={busy !== null}
          />
          <select
            className={selectClass}
            value={createCategory}
            onChange={(event) => setCreateCategory(event.target.value)}
            disabled={busy !== null}
          >
            {FLOW_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <Input
            placeholder="Endpoint URI (optional)"
            value={createEndpoint}
            onChange={(event) => setCreateEndpoint(event.target.value)}
            disabled={busy !== null}
          />
          <Input
            placeholder="Clone Flow ID (optional)"
            value={cloneFlowId}
            onChange={(event) => setCloneFlowId(event.target.value)}
            disabled={busy !== null}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={createDraft} disabled={busy !== null || !createName.trim()}>
            {busy === "create" ? "Creating…" : "Create Draft"}
          </Button>
        </div>
      </Panel>

      {editFlowId && (
        <Panel title="Edit draft metadata">
          <div className="grid gap-3 md:grid-cols-3">
            <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
            <select
              className={selectClass}
              value={editCategory}
              onChange={(event) => setEditCategory(event.target.value)}
            >
              {FLOW_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <Input
              placeholder="Endpoint URI"
              value={editEndpoint}
              onChange={(event) => setEditEndpoint(event.target.value)}
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditFlowId(null)} disabled={busy !== null}>
              Cancel
            </Button>
            <Button onClick={saveMetadata} disabled={busy !== null || !editName.trim()}>
              Save Metadata
            </Button>
          </div>
        </Panel>
      )}

      {jsonFlowId && (
        <Panel title="Flow JSON asset">
          <p className="mb-3 text-sm text-muted-foreground">
            Uploads a server-side multipart FLOW_JSON asset to Meta. Tokens never reach the browser.
          </p>
          <Textarea
            className="min-h-72 font-mono text-xs"
            placeholder='{"version":"7.1","screens":[]}'
            value={flowJson}
            onChange={(event) => setFlowJson(event.target.value)}
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setJsonFlowId(null)} disabled={busy !== null}>
              Close
            </Button>
            <Button onClick={uploadJsonAsset} disabled={busy !== null || !flowJson.trim()}>
              {busy === `json:${jsonFlowId}` ? "Uploading…" : "Upload & Validate"}
            </Button>
          </div>
        </Panel>
      )}

      <Panel title="Flow inventory">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Flow</th>
                <th className="py-2 pr-4 font-medium">Flow ID</th>
                <th className="py-2 pr-4 font-medium">WABA</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Categories</th>
                <th className="py-2 pr-4 font-medium">JSON / API</th>
                <th className="py-2 pr-4 font-medium">Endpoint</th>
                <th className="py-2 pr-4 font-medium">Preview</th>
                <th className="py-2 pr-4 font-medium">Validation</th>
                <th className="py-2 pr-4 font-medium">Last Sync</th>
                <th className="py-2 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((flow) => {
                const waba = wabas.find((item) => item.id === flow.waba_id);
                const status = flow.status.toUpperCase();
                return (
                  <tr key={flow.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4">
                      <span className="flex items-center gap-2 font-medium">
                        <GitBranch className="size-4" /> {flow.name}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                      {flow.meta_flow_id}
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      <div>{waba?.name ?? "Unknown WABA"}</div>
                      <div className="font-mono text-muted-foreground">
                        {waba?.meta_waba_id ?? flow.waba_id}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge value={status} />
                    </td>
                    <td className="py-3 pr-4 text-xs">{flow.categories?.join(", ") || "—"}</td>
                    <td className="py-3 pr-4 text-xs">
                      {[flow.json_version, flow.data_api_version].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td className="max-w-64 truncate py-3 pr-4 font-mono text-xs text-muted-foreground">
                      {flow.endpoint_uri ?? "—"}
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      {flow.preview_url ? (
                        <a
                          href={flow.preview_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          Open
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      {(flow.validation_errors?.length ?? 0) === 0
                        ? "OK"
                        : `${flow.validation_errors.length} issue(s)`}
                    </td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">
                      {flow.last_synced_at ? new Date(flow.last_synced_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-2">
                        {status === "DRAFT" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy !== null}
                              onClick={() => {
                                setEditFlowId(flow.id);
                                setEditName(flow.name);
                                setEditCategory(flow.categories?.[0] ?? "OTHER");
                                setEditEndpoint(flow.endpoint_uri ?? "");
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy !== null}
                              onClick={() => {
                                setJsonFlowId(flow.id);
                                setFlowJson("");
                              }}
                            >
                              JSON
                            </Button>
                            <Button
                              size="sm"
                              disabled={busy !== null || flow.validation_errors.length > 0}
                              onClick={() => mutate(flow.id, "publish")}
                            >
                              Publish
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy !== null}
                              onClick={() => mutate(flow.id, "delete")}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                        {status === "PUBLISHED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy !== null}
                            onClick={() => mutate(flow.id, "deprecate")}
                          >
                            Deprecate
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No flows in the current scope.
            </p>
          )}
        </div>
      </Panel>
    </>
  );
}
