import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import {
  Plus,
  GitBranch,
  Play,
  Pause,
  Loader2,
  Zap,
  History,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/use-tenant";
import { useToast } from "@/hooks/use-toast";

const triggerOptions = [
  { value: "message.inbound", label: "رسالة واردة" },
  { value: "message.failed", label: "فشل إرسال رسالة" },
];

const actionOptions = [
  { value: "auto_reply_text", label: "رد نصي تلقائي" },
  { value: "auto_reply_template", label: "إرسال قالب تلقائي" },
  { value: "assign_to", label: "تعيين المحادثة" },
];

/* ── RunRow — expandable log ── */
function RunRow({ run }: { run: any }) {
  const [open, setOpen] = useState(false);
  const log: Array<{ action: string; status: string; error?: string }> = Array.isArray(run.log)
    ? run.log
    : [];
  const wfName = (run.workflows as any)?.name ?? "—";

  return (
    <>
      <tr className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
        <td className="px-5 py-3 text-sm font-medium">{wfName}</td>
        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
          {run.trigger_event || "—"}
        </td>
        <td className="px-4 py-3">
          <span
            className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
              run.status === "completed"
                ? "bg-success/10 text-success border-success/20"
                : "bg-destructive/10 text-destructive border-destructive/20"
            }`}
          >
            {run.status === "completed" ? "✓ مكتمل" : "✗ فشل"}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {new Date(run.created_at).toLocaleString("ar", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </td>
        <td className="px-4 py-3">
          {log.length > 0 && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {log.length} خطوة
            </button>
          )}
        </td>
      </tr>
      {open && log.length > 0 && (
        <tr className="bg-muted/20">
          <td colSpan={5} className="px-5 py-2.5">
            <div className="space-y-1">
              {log.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      entry.status === "done" || entry.status === "enqueued"
                        ? "bg-success"
                        : "bg-destructive"
                    }`}
                  />
                  <span className="font-mono text-foreground">{entry.action}</span>
                  <span className="text-muted-foreground">—</span>
                  <span
                    className={
                      entry.status === "error" ? "text-destructive" : "text-muted-foreground"
                    }
                  >
                    {entry.status}
                    {entry.error ? `: ${entry.error}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const WorkflowsPage = () => {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Form state
  const [wfName, setWfName] = useState("");
  const [trigger, setTrigger] = useState("message.inbound");
  const [actionType, setActionType] = useState("auto_reply_text");
  const [replyText, setReplyText] = useState("");
  const [templateName, setTemplateName] = useState("");

  const fetchWorkflows = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("workflows")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    setWorkflows(data || []);
    setLoading(false);
  }, [tenantId]);

  const fetchRuns = useCallback(async () => {
    if (!tenantId) return;
    setRunsLoading(true);
    const { data } = await supabase
      .from("workflow_runs")
      .select("*, workflows(name)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);
    setRuns(data || []);
    setRunsLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const toggleEnabled = async (id: string, current: boolean) => {
    await supabase.from("workflows").update({ is_enabled: !current }).eq("id", id);
    fetchWorkflows();
  };

  const resetForm = () => {
    setWfName("");
    setTrigger("message.inbound");
    setActionType("auto_reply_text");
    setReplyText("");
    setTemplateName("");
  };

  const handleCreate = async () => {
    if (!tenantId || !wfName.trim()) return;
    setSaving(true);

    const action: any = { type: actionType };
    if (actionType === "auto_reply_text") action.text = replyText;
    if (actionType === "auto_reply_template") {
      action.template_name = templateName;
      action.language = "ar";
    }

    const rules = { trigger, conditions: [], actions: [action] };

    const { error } = await supabase.from("workflows").insert({
      tenant_id: tenantId,
      name: wfName.trim(),
      is_enabled: true,
      rules,
    });

    setSaving(false);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم إنشاء سير العمل" });
      setDialogOpen(false);
      resetForm();
      fetchWorkflows();
    }
  };

  if (tenantLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader title="سير العمل" description="إنشاء وإدارة قواعد الأتمتة">
        <Button className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4" />
          سير عمل جديد
        </Button>
      </PageHeader>

      <Tabs defaultValue="workflows" className="animate-fade-in">
        <TabsList className="mb-5">
          <TabsTrigger value="workflows">
            <GitBranch className="w-3.5 h-3.5 ml-1.5" />
            سير العمل ({workflows.length})
          </TabsTrigger>
          <TabsTrigger value="runs" onClick={fetchRuns}>
            <History className="w-3.5 h-3.5 ml-1.5" />
            سجل التشغيل
          </TabsTrigger>
        </TabsList>

        {/* ── Workflows list ── */}
        <TabsContent value="workflows">
          {workflows.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-8">
              <EmptyState
                icon={GitBranch}
                title="لا يوجد سير عمل"
                description="أنشئ قواعد أتمتة للرد التلقائي وتعيين المحادثات"
              />
            </div>
          ) : (
            <div className="space-y-3">
              {workflows.map((wf) => {
                const rules = wf.rules as { trigger?: string; actions?: unknown[] };
                return (
                  <div key={wf.id} className="bg-card rounded-xl border border-border p-5">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <GitBranch className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{wf.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {rules?.trigger || "—"} → {rules?.actions?.length ?? 0} إجراء
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge
                          status={wf.is_enabled ? "success" : "warning"}
                          label={wf.is_enabled ? "نشط" : "متوقف"}
                        />
                        <button
                          onClick={() => toggleEnabled(wf.id, wf.is_enabled)}
                          className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                          title={wf.is_enabled ? "إيقاف" : "تفعيل"}
                        >
                          {wf.is_enabled ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      أنشئ:{" "}
                      {new Date(wf.created_at).toLocaleDateString("ar", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Runs history ── */}
        <TabsContent value="runs">
          {runsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
            </div>
          ) : runs.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-8">
              <EmptyState
                icon={History}
                title="لا يوجد سجل تشغيل"
                description="يظهر هنا سجل كل مرة شغّل فيها النظام سير العمل تلقائياً"
              />
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-right text-xs font-medium text-muted-foreground px-5 py-3">
                      سير العمل
                    </th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">
                      الحدث
                    </th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">
                      الحالة
                    </th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">
                      الوقت
                    </th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">
                      السجل
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <RunRow key={run.id} run={run} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              سير عمل جديد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>اسم سير العمل</Label>
              <Input
                className="mt-1.5"
                value={wfName}
                onChange={(e) => setWfName(e.target.value)}
                placeholder="مثال: رد تلقائي خارج أوقات العمل"
              />
            </div>
            <div>
              <Label>الحدث المُشغِّل</Label>
              <Select value={trigger} onValueChange={setTrigger}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {triggerOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الإجراء</Label>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {actionOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {actionType === "auto_reply_text" && (
              <div>
                <Label>نص الرد التلقائي</Label>
                <Input
                  className="mt-1.5"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="مرحباً، سنرد عليك قريبًا..."
                />
              </div>
            )}
            {actionType === "auto_reply_template" && (
              <div>
                <Label>اسم القالب</Label>
                <Input
                  className="mt-1.5"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="welcome_message"
                  dir="ltr"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                resetForm();
              }}
            >
              إلغاء
            </Button>
            <Button onClick={handleCreate} disabled={saving || !wfName.trim()}>
              {saving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              إنشاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default WorkflowsPage;
