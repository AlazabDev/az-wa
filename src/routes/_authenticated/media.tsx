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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";

export const Route = createFileRoute("/_authenticated/media")({
  head: () => ({ meta: [{ title: "WhatsApp Media — AzWA" }] }),
  component: MediaPage,
});

function MediaPage() {
  const [dateFilter, setDateFilter] = useState<number | "all" | "custom">(30);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaItemWithUrl | null>(null);
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
      } = { type: typeFilter, page, limit };
      if (dateFilter !== "custom") payload.days = dateFilter;
      if (dateFilter === "custom" && dateRange?.from)
        payload.startDate = dateRange.from.toISOString();
      if (dateFilter === "custom" && dateRange?.to) payload.endDate = dateRange.to.toISOString();
      return getMediaItems({ data: payload });
    },
  });

  const mediaItems = mediaData?.items;
  const totalCount = mediaData?.totalCount ?? 0;

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الملف؟")) return;
    setDeletingId(id);
    try {
      await deleteMediaItem({ data: id });
      toast.success("تم الحذف بنجاح");
      refetch();
    } catch (error) {
      toast.error("حدث خطأ أثناء الحذف");
    } finally {
      setDeletingId(null);
    }
  };

  const copyLink = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("تم النسخ بنجاح");
  };

  const openViewer = (media: MediaItemWithUrl) => {
    setSelectedMedia(media);
    setViewerOpen(true);
  };

  const formatSize = (bytes?: number | null) => {
    if (!bytes) return "0 KB";
    const k = 1024;
    if (bytes < k) return bytes + " Bytes";
    if (bytes < k * k) return (bytes / k).toFixed(1) + " KB";
    return (bytes / (k * k)).toFixed(1) + " MB";
  };

  const getBadgeVariant = (type: string | null) => {
    if (!type) return "secondary";
    if (type.startsWith("image/")) return "default"; // Greenish based on theme or default
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
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-xl border border-border">
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
                <Button variant={dateFilter === "custom" ? "default" : "outline"}>
                  {dateFilter === "custom" && dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
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
            <Select value={typeFilter} onValueChange={setTypeFilter}>
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
        <div className="rounded-xl border border-border bg-card overflow-hidden">
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
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : mediaItems?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No media objects found.
                  </TableCell>
                </TableRow>
              ) : (
                mediaItems?.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium text-sm truncate max-w-[150px]" title={item.id}>
                        {item.id.split("-")[0]}...
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.conversation?.id
                          ? item.conversation.id.split("-")[0] + "..."
                          : "No conversation"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div
                        className="font-medium truncate max-w-[200px]"
                        title={item.filename || "Unnamed"}
                      >
                        {item.filename || "Unnamed file"}
                      </div>
                      <div className="text-xs text-muted-foreground">{item.mime_type}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatSize(item.file_size)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getBadgeVariant(item.mime_type)}>
                        {item.media_type || item.mime_type?.split("/")[0] || "unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      <div dir="ltr" className="text-right text-sm">
                        {format(new Date(item.created_at), "h:mm:ss a .yyyy/M/d")}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {item.signedUrl && (
                          <Button variant="ghost" size="icon" onClick={() => openViewer(item)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyLink(item.signedUrl || item.id)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        {item.signedUrl && (
                          <Button variant="ghost" size="icon" asChild>
                            <a href={item.signedUrl} download target="_blank" rel="noreferrer">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
            <div className="flex items-center justify-between p-4 border-t border-border bg-muted/20">
              <div className="text-sm text-muted-foreground">
                Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalCount)} of{" "}
                {totalCount} items
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * limit >= totalCount}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Image Viewer Modal */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-4xl bg-black/95 border-none shadow-2xl overflow-hidden p-0">
          <DialogHeader className="p-4 absolute top-0 w-full z-10 bg-gradient-to-b from-black/60 to-transparent">
            <DialogTitle className="text-white drop-shadow-md">
              {selectedMedia?.filename || "Image Viewer"}
            </DialogTitle>
            <DialogDescription className="text-gray-300">
              {selectedMedia && formatSize(selectedMedia.file_size)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center min-h-[50vh] max-h-[85vh] w-full mt-10">
            {selectedMedia?.signedUrl ? (
              selectedMedia.mime_type?.startsWith("image/") ? (
                <img
                  src={selectedMedia.signedUrl}
                  alt={selectedMedia.filename || "Media"}
                  className="max-w-full max-h-[85vh] object-contain"
                />
              ) : selectedMedia.mime_type?.startsWith("video/") ? (
                <video
                  src={selectedMedia.signedUrl}
                  controls
                  className="max-w-full max-h-[85vh] object-contain"
                />
              ) : (
                <div className="text-white p-8 text-center">
                  <p>Preview not available for this file type.</p>
                  <Button className="mt-4" asChild>
                    <a href={selectedMedia.signedUrl} download target="_blank" rel="noreferrer">
                      Download File
                    </a>
                  </Button>
                </div>
              )
            ) : (
              <div className="text-white flex flex-col items-center">
                <Loader2 className="h-8 w-8 animate-spin mb-4" />
                <p>Loading media...</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
