import { useState } from "react";
import { FolderOpen, FolderPlus, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface Folder {
  id: string;
  name: string;
  color: string;
  tenant_id: string;
  created_at: string;
  count?: number;
}

interface FolderSidebarProps {
  folders: Folder[];
  activeFolder: string | null; // null = "all"
  onSelect: (folderId: string | null) => void;
  onCreate: (name: string, color: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  totalCount: number;
  loading?: boolean;
}

const COLORS = [
  "#6366f1",
  "#f43f5e",
  "#10b981",
  "#f59e0b",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

export function FolderSidebar({
  folders,
  activeFolder,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  totalCount,
  loading,
}: FolderSidebarProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(COLORS[0] ?? "#6366f1");
  const [editFolder, setEditFolder] = useState<Folder | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    await onCreate(newName.trim(), newColor);
    setSaving(false);
    setNewName("");
    setNewColor(COLORS[0] ?? "#6366f1");
    setShowCreate(false);
  };

  const handleRename = async () => {
    if (!editFolder || !editName.trim()) return;
    setSaving(true);
    await onRename(editFolder.id, editName.trim());
    setSaving(false);
    setEditFolder(null);
  };

  const handleDrop = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    e.currentTarget.classList.remove("ring-2", "ring-primary");
    const mediaIds = e.dataTransfer.getData("media_ids");
    if (mediaIds) {
      const event = new CustomEvent("gallery:move-to-folder", {
        detail: { mediaIds: JSON.parse(mediaIds), folderId },
      });
      window.dispatchEvent(event);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("ring-2", "ring-primary");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("ring-2", "ring-primary");
  };

  return (
    <div className="w-56 shrink-0 border-l border-border bg-card rounded-lg p-3 space-y-1 self-start sticky top-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-foreground">المجلدات</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowCreate(true)}>
          <FolderPlus className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* All items */}
          <button
            onClick={() => onSelect(null)}
            onDrop={(e) => handleDrop(e, null)}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors",
              activeFolder === null
                ? "bg-primary/10 text-primary font-medium"
                : "hover:bg-muted text-muted-foreground",
            )}
          >
            <FolderOpen className="w-4 h-4" />
            <span className="flex-1 text-right truncate">الكل</span>
            <span className="text-xs opacity-60">{totalCount}</span>
          </button>

          {folders.map((f) => (
            <div
              key={f.id}
              onDrop={(e) => handleDrop(e, f.id)}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                "group flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors cursor-pointer",
                activeFolder === f.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted text-muted-foreground",
              )}
              onClick={() => onSelect(f.id)}
            >
              <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: f.color }} />
              <span className="flex-1 text-right truncate">{f.name}</span>
              <span className="text-xs opacity-60">{f.count ?? 0}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <button className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted-foreground/10 transition-opacity">
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditFolder(f);
                      setEditName(f.name);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5 ml-2" /> إعادة تسمية
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={() => onDelete(f.id)}>
                    <Trash2 className="w-3.5 h-3.5 ml-2" /> حذف
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>مجلد جديد</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="اسم المجلد"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="mb-3"
          />
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={cn(
                  "w-7 h-7 rounded-full transition-all",
                  newColor === c && "ring-2 ring-offset-2 ring-primary",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={saving || !newName.trim()} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              إنشاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!editFolder} onOpenChange={() => setEditFolder(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>إعادة تسمية المجلد</DialogTitle>
          </DialogHeader>
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          <DialogFooter>
            <Button onClick={handleRename} disabled={saving || !editName.trim()} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
