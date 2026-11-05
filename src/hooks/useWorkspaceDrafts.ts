import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface WorkspaceDraft { id: string; name: string; body: string; category: string; updated: string }
export function useWorkspaceDrafts(section: string) {
  const { user } = useAuth();
  const key = `wa-drafts:${user?.id ?? "signed-out"}:${section}`;
  const read = () => { try { const value = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(value) ? value as WorkspaceDraft[] : []; } catch { return []; } };
  const [state, setState] = useState(() => ({ key, drafts: read() }));
  const drafts = state.key === key ? state.drafts : read();
  const save = (next: WorkspaceDraft[]) => { if (!user) return false; try { localStorage.setItem(key, JSON.stringify(next)); setState({ key, drafts: next }); return true; } catch { toast.error("تعذر حفظ المسودة في هذا المتصفح"); return false; } };
  return { drafts, save };
}