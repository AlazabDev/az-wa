import { useEffect, useState, useCallback, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import {
  Upload,
  Image as ImageIcon,
  Loader2,
  X,
  ZoomIn,
  Download,
  Trash2,
  Grid3X3,
  LayoutGrid,
  CheckCircle2,
  AlertCircle,
  FileImage,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/use-tenant";
import { toast } from "sonner";
import type { MediaKind } from "@/lib/types";

const PAGE_SIZE = 60;

const kindLabel: Record<string, string> = {
  image: "صورة",
  video: "فيديو",
  document: "مستند",
  audio: "صوت",
  sticker: "ملصق",
  other: "أخرى",
};

const kindColor: Record<string, "info" | "success" | "warning" | "neutral"> = {
  image: "info",
  video: "success",
  document: "warning",
  audio: "neutral",
  sticker: "info",
  other: "neutral",
};

interface CloudinaryConfig {
  cloud_name: string;
  api_key: string;
  upload_preset: string;
}

interface UploadingFile {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  result?: any;
}

function cloudinaryThumb(cloudName: string, publicId: string, w = 400, h = 400) {
  return `https://res.cloudinary.com/${cloudName}/image/upload/c_fill,w_${w},h_${h},q_auto,f_auto/${publicId}`;
}

function cloudinaryFull(cloudName: string, publicId: string) {
  return `https://res.cloudinary.com/${cloudName}/image/upload/q_auto,f_auto/${publicId}`;
}

const MediaPage = () => {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [mediaFiles, setMediaFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<"all" | MediaKind>("all");
  const [cloudConfig, setCloudConfig] = useState<CloudinaryConfig | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<any | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [gridSize, setGridSize] = useState<"sm" | "lg">("lg");
  const [syncing, setSyncing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Fetch Cloudinary config
  useEffect(() => {
    supabase.functions.invoke("cloudinary_ops", { method: "GET" }).then(({ data, error }) => {
      if (data && !error) setCloudConfig(data);
    });
  }, []);

  // Fetch media files
  const fetchMedia = useCallback(
    async (pageNum = 0, append = false) => {
      if (!tenantId) return;
      setLoading(true);
      let query = supabase
        .from("media_files")
        .select("*")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("received_at", { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (kindFilter !== "all") query = query.eq("kind", kindFilter);

      const { data } = await query;
      const items = data || [];
      setMediaFiles((prev) => (append ? [...prev, ...items] : items));
      setHasMore(items.length === PAGE_SIZE);
      setLoading(false);
    },
    [tenantId, kindFilter],
  );

  useEffect(() => {
    setPage(0);
    fetchMedia(0, false);
  }, [fetchMedia]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchMedia(next, true);
  };

  // Upload to Cloudinary directly
  const uploadFile = async (file: File, index: number) => {
    if (!cloudConfig) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", cloudConfig.upload_preset);

    const updateProgress = (
      progress: number,
      status: UploadingFile["status"],
      result?: any,
      error?: string,
    ) => {
      setUploadQueue((prev) =>
        prev.map((f, i) => (i === index ? { ...f, progress, status, result, error } : f)),
      );
    };

    try {
      updateProgress(10, "uploading");

      const xhr = new XMLHttpRequest();
      const uploadPromise = new Promise<any>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            updateProgress(Math.round((e.loaded / e.total) * 90), "uploading");
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        });
        xhr.addEventListener("error", () => reject(new Error("Network error")));
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudConfig.cloud_name}/auto/upload`);
        xhr.send(formData);
      });

      const result = await uploadPromise;
      updateProgress(100, "done", result);
      return result;
    } catch (err: any) {
      updateProgress(0, "error", undefined, err.message);
      return null;
    }
  };

  const startUpload = async () => {
    if (!cloudConfig || !tenantId || uploadQueue.length === 0) return;
    setIsUploading(true);

    const BATCH_SIZE = 4;
    const results: any[] = [];

    for (let i = 0; i < uploadQueue.length; i += BATCH_SIZE) {
      const batch = uploadQueue.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((item, bIdx) => uploadFile(item.file, i + bIdx)),
      );
      results.push(...batchResults.filter(Boolean));
    }

    // Save metadata to DB
    if (results.length > 0) {
      const files = results.map((r) => ({
        public_id: r.public_id,
        resource_type: r.resource_type,
        format: r.format,
        bytes: r.bytes,
        etag: r.etag,
        mime: `${r.resource_type}/${r.format}`,
      }));

      const { error } = await supabase.functions.invoke("cloudinary_ops", {
        body: { tenant_id: tenantId, files },
      });

      if (error) {
        toast.error("فشل في حفظ البيانات");
      } else {
        toast.success(`تم رفع ${results.length} ملف بنجاح`);
        setShowUpload(false);
        setUploadQueue([]);
        setPage(0);
        fetchMedia(0, false);
      }
    }

    setIsUploading(false);
  };

  const addFiles = (files: FileList | File[]) => {
    const newFiles: UploadingFile[] = Array.from(files).map((file) => ({
      file,
      progress: 0,
      status: "pending",
    }));
    setUploadQueue((prev) => [...prev, ...newFiles]);
    if (!showUpload) setShowUpload(true);
  };

  const removeFromQueue = (index: number) => {
    setUploadQueue((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleSoftDelete = async (mediaId: string) => {
    if (!tenantId) return;
    const { error } = await supabase.functions.invoke("media_delete", {
      body: { tenant_id: tenantId, media_id: mediaId, mode: "soft" },
    });
    if (error) {
      toast.error("فشل في الحذف");
    } else {
      toast.success("تم الحذف");
      setMediaFiles((prev) => prev.filter((m) => m.id !== mediaId));
      setSelectedMedia(null);
    }
  };

  const handleSyncWA = async () => {
    if (!tenantId) return;
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("media_sync_wa", {
      body: { tenant_id: tenantId, limit: 50 },
    });
    setSyncing(false);
    if (error) {
      toast.error(`فشل في المزامنة: ${error.message}`);
    } else {
      toast.success(data?.message || `تمت مزامنة ${data?.synced || 0} ملف`);
      if (data?.synced > 0) fetchMedia(0, false);
    }
  };

  const doneCount = uploadQueue.filter((f) => f.status === "done").length;
  const errorCount = uploadQueue.filter((f) => f.status === "error").length;
  const totalProgress =
    uploadQueue.length > 0
      ? Math.round(uploadQueue.reduce((sum, f) => sum + f.progress, 0) / uploadQueue.length)
      : 0;

  if (tenantLoading) {
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
      <PageHeader title="معرض الوسائط" description="إدارة ومراجعة الصور والملفات" />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <Select
            value={kindFilter}
            onValueChange={(v) => {
              setKindFilter(v as "all" | MediaKind);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="النوع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع</SelectItem>
              <SelectItem value="image">صور</SelectItem>
              <SelectItem value="video">فيديو</SelectItem>
              <SelectItem value="document">مستند</SelectItem>
              <SelectItem value="audio">صوت</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setGridSize("lg")}
              className={`p-2 transition-colors ${gridSize === "lg" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setGridSize("sm")}
              className={`p-2 transition-colors ${gridSize === "sm" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
          </div>
          <span className="text-sm text-muted-foreground">
            {mediaFiles.length} ملف{hasMore ? "+" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSyncWA} disabled={syncing} className="gap-2">
            {syncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            مزامنة واتساب
          </Button>
          <Button onClick={() => setShowUpload(true)} className="gap-2">
            <Upload className="w-4 h-4" />
            رفع ملفات
          </Button>
        </div>
      </div>

      {/* Drop zone overlay */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className="relative"
      >
        {dragOver && (
          <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary rounded-xl flex items-center justify-center backdrop-blur-sm">
            <div className="text-center">
              <Upload className="w-12 h-12 text-primary mx-auto mb-2" />
              <p className="text-lg font-semibold text-primary">أفلت الملفات هنا</p>
            </div>
          </div>
        )}

        {/* Gallery */}
        {loading && mediaFiles.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : mediaFiles.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-8">
            <EmptyState
              icon={ImageIcon}
              title="لا توجد وسائط"
              description="اسحب وأفلت الملفات هنا أو اضغط على زر الرفع"
            />
          </div>
        ) : (
          <>
            <div
              className={`grid gap-3 ${
                gridSize === "lg"
                  ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                  : "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
              }`}
            >
              {mediaFiles.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  cloudName={cloudConfig?.cloud_name}
                  size={gridSize}
                  onClick={() => setSelectedMedia(item)}
                />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-6">
                <Button variant="outline" onClick={loadMore} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                  تحميل المزيد
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Lightbox */}
      <Dialog open={!!selectedMedia} onOpenChange={() => setSelectedMedia(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/95">
          {selectedMedia && cloudConfig && (
            <div className="flex flex-col">
              <div className="flex-1 flex items-center justify-center min-h-[60vh] p-4">
                {selectedMedia.storage_bucket === "cloudinary" && selectedMedia.storage_key ? (
                  <img
                    src={cloudinaryFull(cloudConfig.cloud_name, selectedMedia.storage_key)}
                    alt=""
                    className="max-w-full max-h-[70vh] object-contain rounded"
                  />
                ) : (
                  <div className="text-muted-foreground text-center">
                    <FileImage className="w-16 h-16 mx-auto mb-2 opacity-50" />
                    <p>معاينة غير متاحة</p>
                  </div>
                )}
              </div>
              <div className="p-4 bg-card border-t border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusBadge
                    status={kindColor[selectedMedia.kind] || "neutral"}
                    label={kindLabel[selectedMedia.kind] || selectedMedia.kind}
                  />
                  <span className="text-sm text-muted-foreground">
                    {selectedMedia.mime || "—"} • {formatSize(selectedMedia.size_bytes)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(selectedMedia.received_at).toLocaleDateString("ar")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedMedia.storage_bucket === "cloudinary" && selectedMedia.storage_key && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        window.open(
                          cloudinaryFull(cloudConfig.cloud_name, selectedMedia.storage_key),
                          "_blank",
                        )
                      }
                    >
                      <Download className="w-4 h-4 ml-1" />
                      تحميل
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleSoftDelete(selectedMedia.id)}
                  >
                    <Trash2 className="w-4 h-4 ml-1" />
                    حذف
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog
        open={showUpload}
        onOpenChange={(open) => {
          if (!isUploading) {
            setShowUpload(open);
            if (!open) setUploadQueue([]);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">رفع ملفات</h2>

            {/* Drop area */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
            >
              <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                اسحب وأفلت الملفات هنا أو{" "}
                <span className="text-primary font-medium">اختر ملفات</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">يدعم جميع أنواع الصور والملفات</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                }}
              />
            </div>

            {/* Queue */}
            {uploadQueue.length > 0 && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span>{uploadQueue.length} ملف</span>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    {doneCount > 0 && (
                      <span className="flex items-center gap-1 text-[hsl(var(--chart-2))]">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {doneCount}
                      </span>
                    )}
                    {errorCount > 0 && (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertCircle className="w-3.5 h-3.5" /> {errorCount}
                      </span>
                    )}
                  </div>
                </div>

                {isUploading && <Progress value={totalProgress} className="h-2" />}

                <ScrollArea className="max-h-64">
                  <div className="space-y-2">
                    {uploadQueue.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                          {item.file.type.startsWith("image/") ? (
                            <img
                              src={URL.createObjectURL(item.file)}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <FileImage className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate" dir="ltr">
                            {item.file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatSize(item.file.size)}
                          </p>
                        </div>
                        {item.status === "uploading" && (
                          <div className="w-16">
                            <Progress value={item.progress} className="h-1.5" />
                          </div>
                        )}
                        {item.status === "done" && (
                          <CheckCircle2 className="w-5 h-5 text-[hsl(var(--chart-2))] flex-shrink-0" />
                        )}
                        {item.status === "error" && (
                          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
                        )}
                        {item.status === "pending" && !isUploading && (
                          <button
                            onClick={() => removeFromQueue(idx)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <div className="flex justify-end gap-2">
                  {!isUploading && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setUploadQueue([]);
                        setShowUpload(false);
                      }}
                    >
                      إلغاء
                    </Button>
                  )}
                  <Button onClick={startUpload} disabled={isUploading || uploadQueue.length === 0}>
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin ml-2" />
                        جاري الرفع... {totalProgress}%
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 ml-2" />
                        رفع {uploadQueue.length} ملف
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

// --- Sub-components ---

function MediaCard({
  item,
  cloudName,
  size,
  onClick,
}: {
  item: any;
  cloudName?: string;
  size: "sm" | "lg";
  onClick: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const isCloudinary = item.storage_bucket === "cloudinary" && item.storage_key;
  const thumbSize = size === "lg" ? 400 : 200;

  return (
    <div
      onClick={onClick}
      className="group relative aspect-square bg-muted rounded-lg overflow-hidden cursor-pointer border border-border hover:border-primary/50 transition-all"
    >
      {isCloudinary && cloudName ? (
        <>
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          <img
            src={cloudinaryThumb(cloudName, item.storage_key, thumbSize, thumbSize)}
            alt=""
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
          <FileImage className="w-8 h-8 mb-1 opacity-50" />
          <span className="text-xs">{kindLabel[item.kind] || item.kind}</span>
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
        <ZoomIn className="w-6 h-6 text-white" />
      </div>

      {/* Kind badge */}
      {size === "lg" && (
        <div className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
            {kindLabel[item.kind] || item.kind}
          </span>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default MediaPage;
