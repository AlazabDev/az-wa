import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/azwa/page-header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Eye, Copy, Download, Trash, Loader2 } from "lucide-react";
import { getMediaItems, deleteMediaItem } from "@/lib/media.functions";
import type { MediaItemWithUrl } from "@/lib/media.functions";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";

export const Route = createFileRoute("/_authenticated/media")({
  head: () => ({
    meta: [{ title: "WhatsApp Media — AzWA" }],
  }),
  component: MediaPage,
});

function MediaPage() {
  const [dateFilter, setDateFilter] = useState<
    number | "all" | "custom"
  >(30);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] =
    useState<MediaItemWithUrl | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 50;

  const {
    data: mediaData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["media", dateFilter, dateRange, typeFilter, page, limit],
    queryFn: () => {
      const payload: {
        days?: number | "all";
        startDate?: string;
        endDate?: string;
        type?: string;
        page?: number;
        limit?: number;
      } = {
        type: typeFilter,
        page,
        limit,
      };

      if (dateFilter !== "custom") {
        payload.days = dateFilter;
      }

      if (dateFilter === "custom" && dateRange?.from) {
        payload.startDate = dateRange.from.toISOString();
      }

      if (dateFilter === "custom" && dateRange?.to) {
        payload.endDate = dateRange.to.toISOString();
      }

      return getMediaItems({ data: payload });
    },
  });

  const mediaItems = mediaData?.items;
  const totalCount = mediaData?.totalCount ?? 0;

  const handleDelete = async (id: string) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا الملف؟")) {
      return;
    }

    setDeletingId(id);

    try {
      await deleteMediaItem({ data: id });
      toast.success("تم الحذف بنجاح");

      if (selectedMedia?.id === id) {
        setViewerOpen(false);
        setSelectedMedia(null);
      }

      await refetch();
    } catch {
      toast.error("حدث خطأ أثناء الحذف");
    } finally {
      setDeletingId(null);
    }
  };

  const copyLink = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("تم النسخ بنجاح");
    } catch {
      toast.error("تعذر نسخ الرابط");
    }
  };

  const openViewer = (media: MediaItemWithUrl) => {
    setSelectedMedia(media);
    setViewerOpen(true);
  };

  const handleViewerChange = (open: boolean) => {
    setViewerOpen(open);

    if (!open) {
      setSelectedMedia(null);
    }
  };

  const formatSize = (bytes?: number | null) => {
    if (!bytes) return "0 KB";

    const k = 1024;

    if (bytes < k) {
      return `${bytes} Bytes`;
    }

    if (bytes < k * k) {
      return `${(bytes / k).toFixed(1)} KB`;
    }

    return `${(bytes / (k * k)).toFixed(1)} MB`;
  };

  const getBadgeVariant = (type: string | null) => {
    if (!type) return "secondary";
    if (type.startsWith("image/")) return "default";
    if (type.startsWith("video/")) return "destructive";
    if (type.startsWith("application/")) return "outline";

    return "secondary";
  };

  return (
    <>
      <PageHeader
        title="WhatsApp Media"
        description="Browse media attachments across all conversations. Download or remove media without deleting the original message."
      />

      <div className="grid gap-6">
        {/* Filter Bar */}
        <div className="flex flex-col items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={dateFilter === "all" ? "default" : "outline"}
              onClick={() => {
                setDateFilter("all");
                setPage(1);
              }}
            >
              All Time
            </Button>

            <Button
              variant={dateFilter === 1 ? "default" : "outline"}
              onClick={() => {
                setDateFilter(1);
                setPage(1);
              }}
            >
              Today
            </Button>

            <Button
              variant={dateFilter === 7 ? "default" : "outline"}
              onClick={() => {
                setDateFilter(7);
                setPage(1);
              }}
            >
              Last 7 Days
            </Button>

            <Button
              variant={dateFilter === 30 ? "default" : "outline"}
              onClick={() => {
                setDateFilter(30);
                setPage(1);
              }}
            >
              Last 30 Days
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={
                    dateFilter === "custom" ? "default" : "outline"
                  }
                >
                  {dateFilter === "custom" && dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd, y")}
                        {" - "}
                        {format(dateRange.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(dateRange.from, "LLL dd, y")
                    )
                  ) : (
                    <span>Custom Range</span>
                  )}
                </Button>
              </PopoverTrigger>

              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from || new Date()}
                  selected={dateRange}
                  onSelect={(range) => {
                    setDateRange(range);
                    setDateFilter("custom");
                    setPage(1);
                  }}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="w-full sm:w-auto">
            <Select
              value={typeFilter}
              onValueChange={(value) => {
                setTypeFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="document">Document</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="audio">Audio</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Media Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Message</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : mediaItems?.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No media objects found.
                  </TableCell>
                </TableRow>
              ) : (
                mediaItems?.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div
                        className="max-w-[150px] truncate text-sm font-medium"
                        title={item.id}
                      >
                        {item.id.split("-")[0]}...
                      </div>

                      <div className="text-xs text-muted-foreground">
                        {item.conversation?.id
                          ? `${item.conversation.id.split("-")[0]}...`
                          : "No conversation"}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div
                        className="max-w-[200px] truncate font-medium"
                        title={item.filename || "Unnamed"}
                      >
                        {item.filename || "Unnamed file"}
                      </div>

                      <div className="text-xs text-muted-foreground">
                        {item.mime_type}
                      </div>
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatSize(item.file_size)}
                    </TableCell>

                    <TableCell>
                      <Badge variant={getBadgeVariant(item.mime_type)}>
                        {item.media_type ||
                          item.mime_type?.split("/")[0] ||
                          "unknown"}
                      </Badge>
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      <div dir="ltr" className="text-right text-sm">
                        {format(
                          new Date(item.created_at),
                          "h:mm:ss a .yyyy/M/d",
                        )}
                      </div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="معاينة الملف"
                          aria-label="معاينة الملف"
                          disabled={!item.signedUrl}
                          onClick={() => openViewer(item)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          title="نسخ الرابط"
                          aria-label="نسخ الرابط"
                          onClick={() =>
                            copyLink(item.signedUrl || item.id)
                          }
                        >
                          <Copy className="h-4 w-4" />
                        </Button>

                        {item.signedUrl && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="تحميل"
                            aria-label="تحميل الملف"
                            asChild
                          >
                            <a
                              href={item.signedUrl}
                              download={item.filename || "file"}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          title="حذف الملف"
                          aria-label="حذف الملف"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleDelete(item.id)}
                          disabled={deletingId === item.id}
                        >
                          {deletingId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination Controls */}
          {totalCount > 0 && (
            <div className="flex items-center justify-between border-t border-border bg-muted/20 p-4">
              <div className="text-sm text-muted-foreground">
                Showing {(page - 1) * limit + 1} to{" "}
                {Math.min(page * limit, totalCount)} of {totalCount} items
              </div>

              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={page * limit >= totalCount}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Media Viewer */}
      <Dialog open={viewerOpen} onOpenChange={handleViewerChange}>
        <DialogContent className="max-w-4xl overflow-hidden border border-border bg-background p-0 shadow-2xl">
          <DialogHeader className="min-w-0 border-b border-border bg-muted/40 p-4 pr-12">
            <DialogTitle className="truncate text-base font-semibold text-foreground">
              {selectedMedia?.filename || "معاينة الملف"}
            </DialogTitle>

            <DialogDescription className="text-xs text-muted-foreground">
              {selectedMedia &&
                `${selectedMedia.mime_type || "غير معروف"} • ${formatSize(
                  selectedMedia.file_size,
                )}`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[80vh] min-h-[300px] w-full items-center justify-center overflow-auto bg-black/5 p-6 dark:bg-black/30">
            {selectedMedia?.signedUrl ? (
              selectedMedia.mime_type?.startsWith("image/") ? (
                <img
                  key={selectedMedia.id}
                  src={selectedMedia.signedUrl}
                  alt={selectedMedia.filename || "صورة"}
                  className="max-h-[70vh] max-w-full rounded-md object-contain"
                />
              ) : selectedMedia.mime_type?.startsWith("audio/") ? (
                <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 text-center">
                  <p className="text-sm font-medium text-foreground">
                    تسجيل صوتي واتساب
                  </p>

                  <audio
                    key={selectedMedia.id}
                    controls
                    autoPlay
                    className="w-full"
                  >
                    <source
                      src={selectedMedia.signedUrl}
                      type={selectedMedia.mime_type || "audio/ogg"}
                    />
                    متصفحك لا يدعم تشغيل هذا المقطع الصوتي.
                  </audio>
                </div>
              ) : selectedMedia.mime_type?.startsWith("video/") ? (
                <video
                  key={selectedMedia.id}
                  src={selectedMedia.signedUrl}
                  controls
                  autoPlay
                  className="max-h-[70vh] max-w-full rounded-md"
                />
              ) : selectedMedia.mime_type?.startsWith("application/pdf") ? (

                <iframe
                  key={selectedMedia.id}
                  src={selectedMedia.signedUrl}
                  title={selectedMedia.filename || "PDF"}
                  className="h-[70vh] w-full rounded-md border-0"
                />
              ) : (
                <div className="space-y-3 p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    لا تتوفر معاينة مباشرة لهذا النوع من الملفات.
                  </p>

                  <Button asChild>
                    <a
                      href={selectedMedia.signedUrl}
                      download={selectedMedia.filename || "file"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      تحميل الملف مباشرة
                    </a>
                  </Button>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <p className="text-sm">
                  لا يتوفر رابط لمعاينة هذا الملف.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
