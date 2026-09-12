import { useEffect, useState, useCallback, type DragEvent } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import {
  Search,
  Loader2,
  ImageIcon,
  Grid3X3,
  LayoutGrid,
  Download,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  FileImage,
  Video,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/use-tenant";
import { toast } from "sonner";
import { FolderSidebar, type Folder } from "@/components/gallery/FolderSidebar";
import type { MediaKind } from "@/lib/types";

/* ───────── constants ───────── */
const PAGE_SIZE = 48;

const kindLabel: Record<string, string> = {
  image: "صورة",
  video: "فيديو",
  document: "مستند",
  audio: "صوت",
  sticker: "ملصق",
  other: "أخرى",
};

const sortOptions = [
  { value: "newest", label: "الأحدث أولاً" },
  { value: "oldest", label: "الأقدم أولاً" },
  { value: "largest", label: "الأكبر حجماً" },
  { value: "smallest", label: "الأصغر حجماً" },
];

/* ───────── Cloudinary helpers ───────── */
function cloudThumb(cloud: string, key: string, w = 400, h = 400) {
  return `https://res.cloudinary.com/${cloud}/image/upload/c_fill,w_${w},h_${h},q_auto,f_auto/${key}`;
}
function cloudFull(cloud: string, key: string) {
  return `https://res.cloudinary.com/${cloud}/image/upload/q_auto,f_auto/${key}`;
}
function cloudVideoThumb(cloud: string, key: string, w = 400, h = 400) {
  return `https://res.cloudinary.com/${cloud}/video/upload/c_fill,w_${w},h_${h},q_auto,f_jpg,so_1/${key}`;
}
function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/* ───────── component ───────── */
const GalleryPage = () => {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | MediaKind>("all");
  const [sortBy, setSortBy] = useState("newest");
  const [gridSize, setGridSize] = useState<"sm" | "md" | "lg">("md");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [lightbox, setLightbox] = useState<{ item: any; index: number } | null>(null);
  const [cloudName, setCloudName] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  // Folders
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fetch Cloudinary config
  useEffect(() => {
    supabase.functions.invoke("cloudinary_ops", { method: "GET" }).then(({ data }) => {
      if (data?.cloud_name) setCloudName(data.cloud_name);
    });
  }, []);

  // Fetch folders
  const fetchFolders = useCallback(async () => {
    if (!tenantId) return;
    setFoldersLoading(true);
    const { data } = await supabase
      .from("media_folders")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });

    const folderList: Folder[] = data || [];

    // Get counts per folder
    if (folderList.length > 0) {
      const { data: counts } = await supabase
        .from("media_files")
        .select("folder_id")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .not("folder_id", "is", null);

      const countMap: Record<string, number> = {};
      (counts || []).forEach((r: any) => {
        countMap[r.folder_id] = (countMap[r.folder_id] || 0) + 1;
      });
      folderList.forEach((f) => {
        f.count = countMap[f.id] || 0;
      });
    }

    setFolders(folderList);
    setFoldersLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  // Fetch gallery items
  const fetchItems = useCallback(
    async (pageNum = 0, append = false) => {
      if (!tenantId) return;
      setLoading(true);

      let query = supabase
        .from("media_files")
        .select("*", { count: "exact" })
        .eq("tenant_id", tenantId)
        .is("deleted_at", null);

      if (activeFolder !== null) {
        query = query.eq("folder_id", activeFolder);
      }
      if (kindFilter !== "all") query = query.eq("kind", kindFilter);
      if (search) {
        query = query.or(`storage_key.ilike.%${search}%,mime.ilike.%${search}%`);
      }

      switch (sortBy) {
        case "oldest":
          query = query.order("received_at", { ascending: true });
          break;
        case "largest":
          query = query.order("size_bytes", { ascending: false, nullsFirst: false });
          break;
        case "smallest":
          query = query.order("size_bytes", { ascending: true, nullsFirst: false });
          break;
        default:
          query = query.order("received_at", { ascending: false });
      }

      query = query.range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      const { data, count } = await query;
      const results = data || [];

      let finalResults = results;
      if (results.length > 0) {
        const ids = results.map((item: any) => item.id);
        const { data: aiData } = await supabase
          .from("ai_extractions")
          .select(
            "id, media_file_id, status, summary, classification, tags, confidence, processed_at, extracted_fields, error_message, created_at",
          )
          .eq("tenant_id", tenantId)
          .in("media_file_id", ids)
          .order("created_at", { ascending: false });

        const latestMap: Record<string, any> = {};
        (aiData || []).forEach((row: any) => {
          if (row.media_file_id && !latestMap[row.media_file_id])
            latestMap[row.media_file_id] = row;
        });

        finalResults = results.map((item: any) => ({
          ...item,
          latest_extraction: latestMap[item.id] ?? null,
        }));
      }

      setItems((prev) => (append ? [...prev, ...finalResults] : finalResults));
      setHasMore(results.length === PAGE_SIZE);
      if (count !== null) setTotalCount(count);
      setLoading(false);
    },
    [tenantId, kindFilter, search, sortBy, activeFolder],
  );

  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
    fetchItems(0, false);
  }, [fetchItems]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchItems(next, true);
  };

  // Sync
  const handleSync = async () => {
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
      if (data?.synced > 0) fetchItems(0, false);
    }
  };

  // Soft delete
  const handleDelete = async (id: string) => {
    if (!tenantId) return;
    const { error } = await supabase.functions.invoke("media_delete", {
      body: { tenant_id: tenantId, media_id: id, mode: "soft" },
    });
    if (error) {
      toast.error("فشل في الحذف");
    } else {
      toast.success("تم الحذف");
      setItems((prev) => prev.filter((m) => m.id !== id));
      setTotalCount((prev) => prev - 1);
      setLightbox(null);
    }
  };

  // Folder CRUD
  const createFolder = async (name: string, color: string) => {
    if (!tenantId) return;
    const { error } = await supabase
      .from("media_folders")
      .insert({ tenant_id: tenantId, name, color });
    if (error) toast.error("فشل في إنشاء المجلد");
    else {
      toast.success("تم إنشاء المجلد");
      fetchFolders();
    }
  };

  const renameFolder = async (id: string, name: string) => {
    const { error } = await supabase.from("media_folders").update({ name }).eq("id", id);
    if (error) toast.error("فشل في التعديل");
    else {
      toast.success("تم التعديل");
      fetchFolders();
    }
  };

  const deleteFolder = async (id: string) => {
    const { error } = await supabase.from("media_folders").delete().eq("id", id);
    if (error) toast.error("فشل في حذف المجلد");
    else {
      toast.success("تم حذف المجلد");
      if (activeFolder === id) setActiveFolder(null);
      fetchFolders();
    }
  };

  // Move to folder (via drag or selection)
  const moveToFolder = useCallback(
    async (mediaIds: string[], folderId: string | null) => {
      const { error } = await supabase
        .from("media_files")
        .update({ folder_id: folderId })
        .in("id", mediaIds);
      if (error) {
        toast.error("فشل في النقل");
        return;
      }
      toast.success(`تم نقل ${mediaIds.length} ملف`);
      setSelectedIds(new Set());
      fetchItems(0, false);
      fetchFolders();
    },
    [fetchItems, fetchFolders],
  );

  // Listen for drag-drop events from sidebar
  useEffect(() => {
    const handler = (e: Event) => {
      const { mediaIds, folderId } = (e as CustomEvent).detail;
      moveToFolder(mediaIds, folderId);
    };
    window.addEventListener("gallery:move-to-folder", handler);
    return () => window.removeEventListener("gallery:move-to-folder", handler);
  }, [moveToFolder]);

  // Selection toggle
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Drag start
  const handleDragStart = (e: DragEvent, itemId: string) => {
    const ids =
      selectedIds.size > 0 && selectedIds.has(itemId) ? Array.from(selectedIds) : [itemId];
    e.dataTransfer.setData("media_ids", JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleAnalyze = async (item: any, force = false) => {
    if (!tenantId) return;
    setAnalyzingId(item.id);
    const { error } = await supabase.functions.invoke("ai_vision", {
      body: {
        tenant_id: tenantId,
        media_file_id: item.id,
        force,
      },
    });
    setAnalyzingId(null);

    if (error) {
      toast.error(error.message || "فشل في التحليل");
      return;
    }

    toast.success(force ? "تمت إعادة التحليل" : "تم بدء التحليل");
    setPage(0);
    await fetchItems(0, false);
  };

  // Lightbox navigation
  const navigateLightbox = (dir: 1 | -1) => {
    if (!lightbox) return;
    const newIdx = lightbox.index + dir;
    if (newIdx >= 0 && newIdx < items.length) setLightbox({ item: items[newIdx], index: newIdx });
  };

  // Thumbnails
  const getThumb = (item: any, w = 400, h = 400) => {
    if (!cloudName || item.storage_bucket !== "cloudinary" || !item.storage_key) return null;
    if (item.kind === "video") return cloudVideoThumb(cloudName, item.storage_key, w, h);
    if (item.kind === "image") return cloudThumb(cloudName, item.storage_key, w, h);
    return null;
  };
  const getFullUrl = (item: any) => {
    if (!cloudName || item.storage_bucket !== "cloudinary" || !item.storage_key) return null;
    return cloudFull(cloudName, item.storage_key);
  };

  const gridClasses = {
    sm: "grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12",
    md: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
    lg: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
  };

  const imageCount = items.filter((i) => i.kind === "image").length;
  const videoCount = items.filter((i) => i.kind === "video").length;

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
      <PageHeader
        title="معرض المشروعات"
        description="مراجعة صور وفيديوهات المشروعات من واتساب الأعمال"
      >
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Select
              onValueChange={(fId) =>
                moveToFolder(Array.from(selectedIds), fId === "__none" ? null : fId)
              }
            >
              <SelectTrigger className="w-40 bg-card">
                <SelectValue placeholder={`نقل ${selectedIds.size} ملف`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">بدون مجلد</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={handleSync} disabled={syncing} className="gap-2">
            {syncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            مزامنة واتساب
          </Button>
        </div>
      </PageHeader>

      <div className="flex gap-5">
        {/* Folder sidebar */}
        <FolderSidebar
          folders={folders}
          activeFolder={activeFolder}
          onSelect={setActiveFolder}
          onCreate={createFolder}
          onRename={renameFolder}
          onDelete={deleteFolder}
          totalCount={totalCount}
          loading={foldersLoading}
        />

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Stats bar */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5">
              <ImageIcon className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{totalCount}</span>
              <span className="text-xs text-muted-foreground">ملف</span>
            </div>
            {imageCount > 0 && (
              <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5">
                <FileImage className="w-3.5 h-3.5 text-[hsl(var(--chart-2))]" />
                <span className="text-sm">{imageCount} صورة</span>
              </div>
            )}
            {videoCount > 0 && (
              <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5">
                <Video className="w-3.5 h-3.5 text-[hsl(var(--chart-4))]" />
                <span className="text-sm">{videoCount} فيديو</span>
              </div>
            )}
          </div>

          {/* Filters bar */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو النوع..."
                className="pr-9 bg-card"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={kindFilter}
              onValueChange={(v) => {
                setKindFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-36 bg-card">
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
            <Select
              value={sortBy}
              onValueChange={(v) => {
                setSortBy(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-40 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex border border-border rounded-lg overflow-hidden mr-auto">
              {(["lg", "md", "sm"] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => setGridSize(size)}
                  className={`p-2 transition-colors ${gridSize === size ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
                  title={size === "lg" ? "كبير" : size === "md" ? "متوسط" : "صغير"}
                >
                  {size === "sm" ? (
                    <Grid3X3 className="w-4 h-4" />
                  ) : (
                    <LayoutGrid className="w-4 h-4" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Gallery Grid */}
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-12">
              <EmptyState
                icon={ImageIcon}
                title="لا توجد صور"
                description={
                  activeFolder
                    ? "لا توجد ملفات في هذا المجلد — اسحب الصور هنا"
                    : "اضغط مزامنة واتساب لجلب صور المشروعات"
                }
              />
            </div>
          ) : (
            <>
              <div className={`grid gap-2 ${gridClasses[gridSize]}`}>
                {items.map((item, idx) => {
                  const thumb = getThumb(
                    item,
                    gridSize === "sm" ? 200 : 400,
                    gridSize === "sm" ? 200 : 400,
                  );
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, item.id)}
                      className={`group relative bg-card border rounded-lg overflow-hidden cursor-pointer hover:shadow-md transition-all duration-200 ${isSelected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"}`}
                      onClick={(e) => {
                        if (e.ctrlKey || e.metaKey) {
                          toggleSelect(item.id);
                          return;
                        }
                        setLightbox({ item, index: idx });
                      }}
                    >
                      {/* Selection checkbox */}
                      <div
                        className={`absolute top-2 right-2 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected ? "bg-primary border-primary text-primary-foreground" : "border-white/70 bg-black/20 opacity-0 group-hover:opacity-100"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(item.id);
                        }}
                      >
                        {isSelected && <span className="text-xs">✓</span>}
                      </div>

                      <div
                        className={`relative ${gridSize === "sm" ? "aspect-square" : "aspect-[4/3]"}`}
                      >
                        {thumb ? (
                          <img
                            src={thumb}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <FileImage className="w-8 h-8 text-muted-foreground/40" />
                          </div>
                        )}
                        {item.kind === "video" && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
                              <Video className="w-5 h-5 text-white" />
                            </div>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <ZoomIn className="w-6 h-6 text-white drop-shadow-lg" />
                        </div>
                      </div>

                      {gridSize !== "sm" && (
                        <div className="p-2 border-t border-border space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {kindLabel[item.kind] || item.kind}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {formatSize(item.size_bytes)}
                            </span>
                          </div>
                          {((item.latest_extraction?.tags || item.ai_tags || []) as string[])
                            .length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {((item.latest_extraction?.tags || item.ai_tags || []) as string[])
                                .slice(0, 3)
                                .map((tag: string) => (
                                  <span
                                    key={`${item.id}-${tag}`}
                                    className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]"
                                  >
                                    {tag}
                                  </span>
                                ))}
                            </div>
                          )}
                          <p
                            className="text-[10px] text-muted-foreground mt-0.5 truncate"
                            dir="ltr"
                          >
                            {formatDate(item.received_at)}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {hasMore && (
                <div className="flex justify-center mt-8">
                  <Button
                    variant="outline"
                    onClick={loadMore}
                    disabled={loading}
                    className="gap-2 px-8"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    تحميل المزيد
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Lightbox */}
      <Dialog open={!!lightbox} onOpenChange={() => setLightbox(null)}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden bg-black/95 border-0">
          {lightbox && (
            <div className="flex flex-col h-[85vh]">
              <div className="flex-1 relative flex items-center justify-center p-4 min-h-0">
                {getFullUrl(lightbox.item) ? (
                  lightbox.item.kind === "video" ? (
                    <video
                      src={`https://res.cloudinary.com/${cloudName}/video/upload/${lightbox.item.storage_key}`}
                      controls
                      className="max-w-full max-h-full rounded"
                    />
                  ) : (
                    <img
                      src={getFullUrl(lightbox.item)!}
                      alt=""
                      className="max-w-full max-h-full object-contain rounded"
                    />
                  )
                ) : (
                  <div className="text-muted-foreground text-center">
                    <FileImage className="w-16 h-16 mx-auto mb-2 opacity-50" />
                    <p>معاينة غير متاحة</p>
                  </div>
                )}
                {lightbox.index > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateLightbox(-1);
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                  >
                    <ChevronRight className="w-6 h-6 text-white" />
                  </button>
                )}
                {lightbox.index < items.length - 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateLightbox(1);
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                  >
                    <ChevronLeft className="w-6 h-6 text-white" />
                  </button>
                )}
                <div className="absolute top-4 left-4 bg-black/50 rounded-full px-3 py-1 text-xs text-white/70">
                  {lightbox.index + 1} / {items.length}
                </div>
              </div>
              <div className="p-4 bg-card border-t border-border space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="outline">
                      {kindLabel[lightbox.item.kind] || lightbox.item.kind}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {lightbox.item.mime || "—"} • {formatSize(lightbox.item.size_bytes)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {formatDate(lightbox.item.received_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleAnalyze(lightbox.item, !!lightbox.item.latest_extraction)
                      }
                      className="gap-1"
                      disabled={analyzingId === lightbox.item.id}
                    >
                      {analyzingId === lightbox.item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}{" "}
                      {lightbox.item.latest_extraction ? "إعادة التحليل" : "تحليل AI"}
                    </Button>
                    {getFullUrl(lightbox.item) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(getFullUrl(lightbox.item)!, "_blank")}
                        className="gap-1"
                      >
                        <Download className="w-4 h-4" /> تحميل
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(lightbox.item.id)}
                      className="gap-1"
                    >
                      <Trash2 className="w-4 h-4" /> حذف
                    </Button>
                  </div>
                </div>

                {(lightbox.item.latest_extraction ||
                  lightbox.item.ai_summary ||
                  (lightbox.item.ai_tags || []).length > 0) && (
                  <div className="rounded-xl border border-border p-3 bg-background space-y-3">
                    {(lightbox.item.latest_extraction?.summary || lightbox.item.ai_summary) && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">ملخص الذكاء الاصطناعي</p>
                        <p className="text-sm leading-6">
                          {lightbox.item.latest_extraction?.summary || lightbox.item.ai_summary}
                        </p>
                      </div>
                    )}
                    {(
                      (lightbox.item.latest_extraction?.tags ||
                        lightbox.item.ai_tags ||
                        []) as string[]
                    ).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {(
                          (lightbox.item.latest_extraction?.tags ||
                            lightbox.item.ai_tags ||
                            []) as string[]
                        ).map((tag: string) => (
                          <Badge key={`${lightbox.item.id}-lightbox-${tag}`} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default GalleryPage;
