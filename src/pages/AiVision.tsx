import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/use-tenant";
import {
  AlertCircle,
  Bot,
  Brain,
  CheckCircle2,
  Clock3,
  FileSearch,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface MediaItem {
  id: string;
  kind: string;
  mime: string | null;
  received_at: string;
  size_bytes: number | null;
  storage_bucket: string;
  storage_key: string | null;
  ai_status: string;
  ai_summary: string | null;
  ai_tags: string[];
  ai_processed_at: string | null;
}

interface ExtractionRow {
  id: string;
  media_file_id: string | null;
  message_id: string | null;
  status: string;
  summary: string | null;
  classification: string | null;
  extracted_fields: Record<string, unknown>;
  tags: string[];
  confidence: number | null;
  created_at: string;
  processed_at: string | null;
  error_message: string | null;
  input_mime: string | null;
}

const PAGE_SIZE = 60;

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusMeta(status: string) {
  switch (status) {
    case "completed":
      return { label: "مكتمل", icon: CheckCircle2, className: "text-emerald-600" };
    case "failed":
      return { label: "فشل", icon: AlertCircle, className: "text-red-600" };
    case "processing":
      return { label: "يعالج الآن", icon: Loader2, className: "text-amber-600" };
    default:
      return { label: "بانتظار التحليل", icon: Clock3, className: "text-slate-500" };
  }
}

function firstFields(fields: Record<string, unknown>) {
  return Object.entries(fields || {})
    .filter(([, value]) => value !== null && value !== "")
    .slice(0, 6);
}

const AiVisionPage = () => {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [latestExtractions, setLatestExtractions] = useState<Record<string, ExtractionRow>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "processing" | "completed" | "failed"
  >("all");
  const [kindFilter, setKindFilter] = useState<"all" | "image" | "document">("all");
  const [analyzingIds, setAnalyzingIds] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(
    async (showRefreshSpinner = false) => {
      if (!tenantId) return;
      if (showRefreshSpinner) setRefreshing(true);
      else setLoading(true);

      let mediaQuery = supabase
        .from("media_files")
        .select(
          "id, kind, mime, received_at, size_bytes, storage_bucket, storage_key, ai_status, ai_summary, ai_tags, ai_processed_at",
        )
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .in("kind", ["image", "document"])
        .order("received_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (kindFilter !== "all") mediaQuery = mediaQuery.eq("kind", kindFilter);
      if (statusFilter !== "all") mediaQuery = mediaQuery.eq("ai_status", statusFilter);
      if (search.trim()) {
        mediaQuery = mediaQuery.or(
          `mime.ilike.%${search.trim()}%,storage_key.ilike.%${search.trim()}%,ai_summary.ilike.%${search.trim()}%`,
        );
      }

      const { data: mediaData, error: mediaError } = await mediaQuery;

      if (mediaError) {
        toast.error(mediaError.message);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const mediaItems = (mediaData || []) as MediaItem[];
      setItems(mediaItems);

      const mediaIds = mediaItems.map((item) => item.id);
      if (mediaIds.length === 0) {
        setLatestExtractions({});
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const { data: extractionData, error: extractionError } = await supabase
        .from("ai_extractions")
        .select(
          "id, media_file_id, message_id, status, summary, classification, extracted_fields, tags, confidence, created_at, processed_at, error_message, input_mime",
        )
        .eq("tenant_id", tenantId)
        .in("media_file_id", mediaIds)
        .order("created_at", { ascending: false });

      if (extractionError) {
        toast.error(extractionError.message);
      }

      const latest: Record<string, ExtractionRow> = {};
      ((extractionData || []) as ExtractionRow[]).forEach((row) => {
        if (row.media_file_id && !latest[row.media_file_id]) latest[row.media_file_id] = row;
      });

      setLatestExtractions(latest);
      setLoading(false);
      setRefreshing(false);
    },
    [tenantId, kindFilter, statusFilter, search],
  );

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      completed: items.filter((item) => item.ai_status === "completed").length,
      processing: items.filter((item) => item.ai_status === "processing").length,
      failed: items.filter((item) => item.ai_status === "failed").length,
    };
  }, [items]);

  async function runAnalysis(mediaId: string, force = false) {
    if (!tenantId) return;
    setAnalyzingIds((prev) => ({ ...prev, [mediaId]: true }));

    const { error } = await supabase.functions.invoke("ai_vision", {
      body: {
        tenant_id: tenantId,
        media_file_id: mediaId,
        force,
      },
    });

    setAnalyzingIds((prev) => ({ ...prev, [mediaId]: false }));

    if (error) {
      toast.error(error.message || "فشل في تحليل الملف");
      return;
    }

    toast.success(force ? "تمت إعادة التحليل" : "تم بدء التحليل");
    fetchData(true);
  }

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
        title="AI Vision"
        description="تحليل الصور والـ PDF واستخراج البيانات المنظمة من وسائط واتساب"
      >
        <Button
          variant="outline"
          onClick={() => fetchData(true)}
          className="gap-2"
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          تحديث
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "الإجمالي", value: stats.total, icon: Brain },
          { label: "مكتمل", value: stats.completed, icon: CheckCircle2 },
          { label: "قيد المعالجة", value: stats.processing, icon: Loader2 },
          { label: "فشل", value: stats.failed, icon: AlertCircle },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <card.icon className={`w-4 h-4 ${card.icon === Loader2 ? "animate-spin" : ""}`} />
            </div>
            <p className="text-3xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-card p-4 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث في النوع أو الملخص أو المسار..."
              className="pr-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
          >
            <SelectTrigger>
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="pending">بانتظار التحليل</SelectItem>
              <SelectItem value="processing">قيد المعالجة</SelectItem>
              <SelectItem value="completed">مكتمل</SelectItem>
              <SelectItem value="failed">فشل</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={kindFilter}
            onValueChange={(value) => setKindFilter(value as typeof kindFilter)}
          >
            <SelectTrigger>
              <SelectValue placeholder="النوع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع</SelectItem>
              <SelectItem value="image">صور</SelectItem>
              <SelectItem value="document">مستندات</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border bg-card p-12">
          <EmptyState
            icon={FileSearch}
            title="لا توجد ملفات قابلة للتحليل"
            description="ابدأ بمزامنة الوسائط أو ارفع PDF/صور ثم عد لهذه الشاشة."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {items.map((item) => {
            const extraction = latestExtractions[item.id];
            const status = statusMeta(item.ai_status || extraction?.status || "pending");
            const StatusIcon = status.icon;
            const fields = firstFields(
              (extraction?.extracted_fields || {}) as Record<string, unknown>,
            );
            const tags = extraction?.tags?.length ? extraction.tags : item.ai_tags || [];

            return (
              <div key={item.id} className="rounded-2xl border bg-card p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">
                        {item.kind === "image" ? "صورة" : "PDF / مستند"}
                      </Badge>
                      <div className={`inline-flex items-center gap-1 text-sm ${status.className}`}>
                        <StatusIcon
                          className={`w-4 h-4 ${item.ai_status === "processing" ? "animate-spin" : ""}`}
                        />
                        <span>{status.label}</span>
                      </div>
                      {extraction?.classification && (
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                          {extraction.classification}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground break-all" dir="ltr">
                      {item.storage_key || item.id}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span>{item.mime || "—"}</span>
                      <span>{formatSize(item.size_bytes)}</span>
                      <span>{formatDate(item.received_at)}</span>
                    </div>
                  </div>

                  <Button
                    onClick={() => runAnalysis(item.id, item.ai_status === "completed")}
                    disabled={!!analyzingIds[item.id]}
                    className="gap-2 shrink-0"
                  >
                    {analyzingIds[item.id] ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {item.ai_status === "completed" ? "إعادة التحليل" : "تحليل الآن"}
                  </Button>
                </div>

                <div className="rounded-xl border bg-background p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    {item.kind === "image" ? (
                      <ImageIcon className="w-4 h-4 mt-1 text-primary" />
                    ) : (
                      <Bot className="w-4 h-4 mt-1 text-primary" />
                    )}
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-medium">الملخص</p>
                      <p className="text-sm text-muted-foreground leading-6">
                        {extraction?.summary || item.ai_summary || "لا يوجد ملخص محفوظ بعد."}
                      </p>
                    </div>
                  </div>

                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <Badge key={`${item.id}-${tag}`} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {fields.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {fields.map(([key, value]) => (
                        <div key={key} className="rounded-lg border bg-card px-3 py-2">
                          <p className="text-[11px] text-muted-foreground mb-1">{key}</p>
                          <p className="text-sm leading-6 break-words">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    <span>
                      الثقة:{" "}
                      {typeof extraction?.confidence === "number"
                        ? `${Math.round(extraction.confidence * 100)}%`
                        : "—"}
                    </span>
                    <span>
                      آخر معالجة: {formatDate(extraction?.processed_at || item.ai_processed_at)}
                    </span>
                  </div>

                  {extraction?.error_message && (
                    <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                      {extraction.error_message}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
};

export default AiVisionPage;
