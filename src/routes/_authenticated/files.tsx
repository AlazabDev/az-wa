import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  CheckCircle2,
  Download,
  File,
  Files,
  HardDrive,
  Loader2,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader, Panel } from "@/components/azwa/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getStoredFileUrl,
  listStoredFiles,
  retryStoredFile,
  type StoredFile,
} from "@/lib/storage/files.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/files")({
  head: () => ({
    meta: [
      { title: "إدارة الملفات — AzWA" },
      {
        name: "description",
        content: "إدارة ملفات WhatsApp المؤرشفة لجميع الأرقام على Milano MinIO.",
      },
    ],
  }),
  component: FilesPage,
});

const PAGE_SIZE = 100;

function formatBytes(value: number | null | undefined) {
  const bytes = value ?? 0;
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const amount = bytes / 1024 ** index;
  return `${amount >= 100 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function fileLabel(file: StoredFile) {
  if (file.filename?.trim()) return file.filename;
  const pathName = file.storagePath?.split("/").filter(Boolean).pop();
  return pathName || file.id;
}

function statusLabel(value: string | null) {
  switch (value) {
    case "downloaded":
      return "محفوظ";
    case "downloading":
      return "جارٍ الحفظ";
    case "failed":
      return "فشل";
    case "pending":
      return "قيد الانتظار";
    default:
      return value || "قيد الانتظار";
  }
}

function StatusPill({ value }: { value: string | null }) {
  const tone =
    value === "downloaded"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : value === "failed"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", tone)}>
      {statusLabel(value)}
    </span>
  );
}

function Metric({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Files;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="rounded-lg border border-border bg-muted/40 p-2">
          <Icon className="size-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

function FilesPage() {
  const loadFiles = useServerFn(listStoredFiles);
  const loadFileUrl = useServerFn(getStoredFileUrl);
  const retryFile = useServerFn(retryStoredFile);

  const [numberId, setNumberId] = useState("all");
  const [status, setStatus] = useState("all");
  const [mediaType, setMediaType] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const input = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(numberId !== "all" ? { numberId } : {}),
      ...(status !== "all" ? { status } : {}),
      ...(mediaType !== "all" ? { mediaType } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    }),
    [mediaType, numberId, page, search, status],
  );

  const query = useQuery({
    queryKey: ["stored-files", input],
    queryFn: () => loadFiles({ data: input }),
    refetchInterval: 30_000,
  });

  const data = query.data;
  const files = data?.files ?? [];
  const totals = data?.totals ?? { all: 0, stored: 0, pending: 0, failed: 0, bytes: 0 };

  function resetPage() {
    setPage(1);
  }

  async function downloadFile(file: StoredFile) {
    setDownloadingId(file.id);
    try {
      const result = await loadFileUrl({ data: { mediaId: file.id } });
      const anchor = document.createElement("a");
      anchor.href = result.url;
      anchor.rel = "noopener";
      anchor.download = fileLabel(file);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحميل الملف من Milano");
    } finally {
      setDownloadingId(null);
    }
  }

  async function retryArchive(file: StoredFile) {
    setRetryingId(file.id);
    try {
      const result = await retryFile({ data: { mediaId: file.id } });
      if (result.status === "failed") {
        toast.error(result.error ?? "فشلت إعادة المحاولة");
      } else if (result.status === "skipped") {
        toast.info("الملف محفوظ بالفعل");
      } else {
        toast.success("تم حفظ الملف على Milano");
      }
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إعادة المحاولة");
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div dir="rtl">
      <PageHeader
        title="إدارة الملفات"
        description="أرشيف مركزي لجميع ملفات WhatsApp الواردة من كل الأرقام، محفوظ بشكل خاص على Milano MinIO."
        actions={
          <Button
            variant="outline"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={cn("ml-2 size-4", query.isFetching && "animate-spin")} />
            تحديث
          </Button>
        }
      />

      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="إجمالي الملفات" value={totals.all.toLocaleString("ar-EG")} icon={Files} />
        <Metric
          label="المحفوظة على Milano"
          value={totals.stored.toLocaleString("ar-EG")}
          icon={CheckCircle2}
        />
        <Metric
          label="قيد المعالجة"
          value={totals.pending.toLocaleString("ar-EG")}
          icon={Archive}
        />
        <Metric
          label="فشل الحفظ"
          value={totals.failed.toLocaleString("ar-EG")}
          icon={TriangleAlert}
        />
        <Metric
          label="إجمالي الحجم"
          value={formatBytes(totals.bytes)}
          hint={data?.bucket ? `Bucket: ${data.bucket}` : "Milano MinIO"}
          icon={HardDrive}
        />
      </div>

      <Panel title="الفلاتر">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,2fr)_minmax(180px,1fr)_minmax(160px,1fr)_minmax(160px,1fr)]">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
              placeholder="بحث باسم الملف أو مسار التخزين…"
              className="pr-9"
            />
          </div>

          <select
            value={numberId}
            onChange={(event) => {
              setNumberId(event.target.value);
              resetPage();
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="فلتر رقم واتساب"
          >
            <option value="all">كل الأرقام</option>
            {(data?.numbers ?? []).map((number) => (
              <option key={number.id} value={number.id}>
                {number.label}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              resetPage();
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="فلتر حالة التخزين"
          >
            <option value="all">كل الحالات</option>
            <option value="downloaded">محفوظ</option>
            <option value="pending">قيد الانتظار</option>
            <option value="downloading">جارٍ الحفظ</option>
            <option value="failed">فشل</option>
          </select>

          <select
            value={mediaType}
            onChange={(event) => {
              setMediaType(event.target.value);
              resetPage();
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="فلتر نوع الملف"
          >
            <option value="all">كل الأنواع</option>
            <option value="image">صور</option>
            <option value="video">فيديو</option>
            <option value="audio">صوت</option>
            <option value="document">مستندات</option>
            <option value="sticker">ملصقات</option>
          </select>
        </div>
      </Panel>

      <div className="mt-6">
        <Panel
          title={`الملفات · ${totals.all.toLocaleString("ar-EG")}`}
          actions={
            <div className="text-xs text-muted-foreground">
              صفحة {data?.page ?? page} من {data?.totalPages ?? 1}
            </div>
          }
        >
          {query.isLoading ? (
            <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              جارٍ تحميل أرشيف Milano…
            </div>
          ) : query.isError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {query.error instanceof Error ? query.error.message : "تعذر تحميل الملفات"}
            </div>
          ) : files.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center">
              <File className="mx-auto mb-3 size-7 text-muted-foreground" />
              <p className="font-medium">لا توجد ملفات مطابقة للفلاتر الحالية.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b border-border text-right text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-3 font-medium">الملف</th>
                    <th className="px-3 py-3 font-medium">رقم واتساب</th>
                    <th className="px-3 py-3 font-medium">النوع</th>
                    <th className="px-3 py-3 font-medium">الحجم</th>
                    <th className="px-3 py-3 font-medium">الحالة</th>
                    <th className="px-3 py-3 font-medium">الاستلام</th>
                    <th className="px-3 py-3 font-medium">التخزين</th>
                    <th className="px-3 py-3 font-medium">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => {
                    const canDownload =
                      file.downloadStatus === "downloaded" && Boolean(file.storagePath);
                    const canRetry =
                      file.downloadStatus !== "downloaded" && file.downloadStatus !== "downloading";
                    return (
                      <tr
                        key={file.id}
                        className="border-b border-border/70 align-top last:border-0"
                      >
                        <td className="max-w-[280px] px-3 py-3">
                          <div
                            className="truncate font-medium text-foreground"
                            title={fileLabel(file)}
                          >
                            {fileLabel(file)}
                          </div>
                          <div
                            className="mt-1 truncate font-mono text-[10px] text-muted-foreground"
                            title={file.id}
                          >
                            {file.id}
                          </div>
                          {file.lastError ? (
                            <div
                              className="mt-2 line-clamp-2 text-xs text-red-600"
                              title={file.lastError}
                            >
                              {file.lastError}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <div className="max-w-[220px] truncate" title={file.numberLabel}>
                            {file.numberLabel}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div>{file.mediaType ?? "—"}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {file.mimeType ?? "—"}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {formatBytes(file.fileSize)}
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill value={file.downloadStatus} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs">
                          {formatDate(file.receivedAt ?? file.createdAt)}
                        </td>
                        <td className="max-w-[260px] px-3 py-3">
                          <div className="text-xs font-medium">
                            {file.storageProvider === "minio"
                              ? "Milano"
                              : (file.storageProvider ?? "—")}
                          </div>
                          <div
                            className="mt-1 truncate font-mono text-[10px] text-muted-foreground"
                            title={file.storagePath ?? ""}
                          >
                            {file.storagePath ?? "غير محفوظ بعد"}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canDownload || downloadingId === file.id}
                              onClick={() => void downloadFile(file)}
                            >
                              {downloadingId === file.id ? (
                                <Loader2 className="ml-1.5 size-3.5 animate-spin" />
                              ) : (
                                <Download className="ml-1.5 size-3.5" />
                              )}
                              تحميل
                            </Button>
                            {canRetry ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={retryingId === file.id}
                                onClick={() => void retryArchive(file)}
                              >
                                <RefreshCw
                                  className={cn(
                                    "ml-1.5 size-3.5",
                                    retryingId === file.id && "animate-spin",
                                  )}
                                />
                                إعادة المحاولة
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              يتم عرض حتى {PAGE_SIZE.toLocaleString("ar-EG")} ملف في الصفحة، والإجماليات محسوبة على
              جميع النتائج المفلترة.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || query.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                السابق
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= (data?.totalPages ?? 1) || query.isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                التالي
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
