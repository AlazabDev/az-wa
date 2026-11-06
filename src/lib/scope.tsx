import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";

export type ScopeKind = "all" | "business" | "waba" | "number";
export type Scope = { kind: ScopeKind; id: string | null; label: string };

const DEFAULT_SCOPE: Scope = { kind: "all", id: null, label: "كل حسابات واتساب" };
const STORAGE_KEY = "azwa.scope";
type ScopeContextValue = { scope: Scope; setScope: (scope: Scope) => void };

const ScopeContext = createContext<ScopeContextValue>({
  scope: DEFAULT_SCOPE,
  setScope: () => {},
});

export function parseSavedScope(value: string | null): Scope | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const next = parsed as Record<string, unknown>;
    if (!["all", "business", "waba", "number"].includes(String(next.kind))) return null;
    if (next.kind === "all") return DEFAULT_SCOPE;
    if (typeof next.id !== "string" || !/^[0-9a-f-]{36}$/i.test(next.id)) return null;
    return {
      kind: next.kind as ScopeKind,
      id: next.id,
      label: typeof next.label === "string" ? next.label.slice(0, 180) : "حساب واتساب",
    };
  } catch {
    return null;
  }
}

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [scope, setCurrentScope] = useState<Scope>(DEFAULT_SCOPE);

  useEffect(() => {
    // Storage can be blocked by the browser, sandboxed preview, or privacy settings.
    // It must never crash the entire authenticated application.
    try {
      const saved = parseSavedScope(window.localStorage.getItem(STORAGE_KEY));
      if (saved) setCurrentScope(saved);
    } catch {
      // Stay on the safe default without mutating auth state.
    }
  }, []);

  const setScope = useCallback((next: Scope) => {
    setCurrentScope((previous) =>
      previous.kind === next.kind && previous.id === next.id && previous.label === next.label
        ? previous
        : next,
    );
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The choice still works in memory during this session.
    }
  }, []);

  const value = useMemo<ScopeContextValue>(() => ({ scope, setScope }), [scope, setScope]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope() {
  return useContext(ScopeContext);
}

/** Returns the authorized inventory's numbers under the selected UI scope. */
export function numbersInScope<
  T extends { id: string; waba_id: string; business_portfolio_id: string },
>(numbers: T[], scope: Scope): T[] {
  if (scope.kind === "all") return numbers;
  if (!scope.id) return [];
  if (scope.kind === "business") return numbers.filter((n) => n.business_portfolio_id === scope.id);
  if (scope.kind === "waba") return numbers.filter((n) => n.waba_id === scope.id);
  return numbers.filter((n) => n.id === scope.id);
}
