import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useWorkspaceDrafts } from "@/hooks/useWorkspaceDrafts";

const auth = vi.hoisted(() => ({ user: { id: "first-user" } as { id: string } | null }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
describe("user-scoped unpublished drafts", () => {
  beforeEach(() => { localStorage.clear(); auth.user = { id: "first-user" }; });
  it("does not carry a user's draft into another user's session", () => {
    const { result, rerender } = renderHook(() => useWorkspaceDrafts("templates"));
    act(() => { result.current.save([{ id: "draft-1", name: "Private", body: "First user only", category: "test", updated: "2026-10-15" }]); });
    expect(result.current.drafts).toHaveLength(1);
    auth.user = { id: "second-user" };
    rerender();
    expect(result.current.drafts).toEqual([]);
    expect(localStorage.getItem("wa-drafts:second-user:templates")).toBeNull();
  });
  it("does not save unpublished drafts while signed out", () => {
    auth.user = null;
    const { result } = renderHook(() => useWorkspaceDrafts("templates"));
    let saved = true;
    act(() => { saved = result.current.save([{ id: "draft-2", name: "Draft", body: "Text", category: "test", updated: "2026-10-15" }]); });
    expect(saved).toBe(false);
    expect(localStorage.getItem("wa-drafts:signed-out:templates")).toBeNull();
  });
});