import { useEffect, useState, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { Search, Shield, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/use-tenant";
import type { AuditLog } from "@/lib/types";

const ACTION_BADGE: Record<string, "success" | "danger" | "warning" | "info" | "neutral"> = {
  MESSAGE_CREATED: "success",
  SEND_MESSAGE: "success",
  META_SYNC_ALL: "info",
  TEMPLATES_SYNC: "info",
  SEAFILE_UPLOAD: "info",
  MEDIA_SOFT_DELETE: "warning",
  MEDIA_HARD_DELETE: "danger",
  APIKEY_INSERT: "warning",
  APIKEY_DELETE: "danger",
  WEBHOOK_INSERT: "info",
  WEBHOOK_DELETE: "danger",
  JOB_FAILED_PERMANENTLY: "danger",
};

function MetaCell({ meta }: { meta: unknown }) {
  const [open, setOpen] = useState(false);
  if (!meta || (typeof meta === "object" && Object.keys(meta as object).length === 0)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const str = JSON.stringify(meta);
  const short = str.length > 60 ? str.slice(0, 60) + "…" : str;
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {open ? "إخفاء" : short}
      </button>
      {open && (
        <pre className="mt-1.5 text-[11px] bg-muted/60 rounded p-2 max-w-xs overflow-x-auto leading-relaxed text-foreground">
          {JSON.stringify(meta, null, 2)}
        </pre>
      )}
    </div>
  );
}

const AuditPage = () => {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebounced] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    let query = supabase
      .from("audit_logs")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (debouncedSearch) query = query.ilike("action", `%${debouncedSearch}%`);
    if (entityFilter !== "all") query = query.eq("entity", entityFilter);
    query.limit(200).then(({ data }) => {
      setLogs((data ?? []) as AuditLog[]);
      setLoading(false);
    });
  }, [tenantId, debouncedSearch, entityFilter]);

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
      <PageHeader
        title="سجلات التدقيق"
        description={`${logs.length} سجل — سجل كامل لكل الأفعال الحساسة`}
      />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث في السجلات..."
            className="pr-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="الكيان" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الكيانات</SelectItem>
            <SelectItem value="api_keys">API Keys</SelectItem>
            <SelectItem value="webhook_endpoints">Webhooks</SelectItem>
            <SelectItem value="media_files">وسائط</SelectItem>
            <SelectItem value="templates">قوالب</SelectItem>
            <SelectItem value="messages">رسائل</SelectItem>
            <SelectItem value="job_queue">Jobs</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {logs.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-8">
          <EmptyState
            icon={Shield}
            title="لا توجد سجلات"
            description="ستظهر سجلات التدقيق هنا عند تنفيذ عمليات حساسة"
          />
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden animate-fade-in">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">
                  الإجراء
                </th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">
                  الكيان
                </th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">
                  التفاصيل
                </th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">
                  الوقت
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const badgeType = ACTION_BADGE[log.action] ?? "neutral";
                return (
                  <tr
                    key={log.id}
                    className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <StatusBadge status={badgeType} label={log.action} />
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                      {log.entity}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <MetaCell meta={log.meta} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("ar", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  );
};

export default AuditPage;
