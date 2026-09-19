import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ScopeKind = "all" | "business" | "waba" | "number";
export type Scope = { kind: ScopeKind; id: string | null; label: string };

const DEFAULT_SCOPE: Scope = { kind: "all", id: null, label: "All Numbers" };
const STORAGE_KEY = "azwa.scope";

type ScopeContextValue = { scope: Scope; setScope: (scope: Scope) => void };
const ScopeContext = createContext<ScopeContextValue>({ scope: DEFAULT_SCOPE, setScope: () => {} });

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState<Scope>(DEFAULT_SCOPE);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setScope(JSON.parse(raw) as Scope);
      } catch {
        /* ignore malformed scope */
      }
    }
  }, []);

  const value = useMemo<ScopeContextValue>(
    () => ({
      scope,
      setScope: (next) => {
        setScope(next);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      },
    }),
    [scope],
  );

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope() {
  return useContext(ScopeContext);
}

/** Returns the internal whatsapp_numbers.id list the current scope resolves to. */
export function numbersInScope<
  T extends { id: string; waba_id: string; business_portfolio_id: string },
>(numbers: T[], scope: Scope): T[] {
  if (scope.kind === "all" || !scope.id) return numbers;
  if (scope.kind === "business") return numbers.filter((n) => n.business_portfolio_id === scope.id);
  if (scope.kind === "waba") return numbers.filter((n) => n.waba_id === scope.id);
  return numbers.filter((n) => n.id === scope.id);
}
