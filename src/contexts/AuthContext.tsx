import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { legacySupabase as supabase } from "@/integrations/supabase/legacy-client";

// Compatibility shape for legacy UI components. Membership is no longer an
// authorization concept: every authenticated AzWA user has the same access.
export type TenantMembership = {
  tenant_id: string;
  role: "admin";
};

type OrganizationScopeRow = {
  id: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  memberships: TenantMembership[];
  currentTenantId: string | null;
  currentRole: "admin" | null;
  setCurrentTenantId: (tenantId: string) => void;
  refreshMemberships: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const TENANT_KEY = "az-wa.current-tenant";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [currentTenantId, setTenantId] = useState<string | null>(() =>
    localStorage.getItem(TENANT_KEY),
  );

  const loadOrganizationScopes = useCallback(async (userId?: string) => {
    if (!userId) {
      setMemberships([]);
      setTenantId(null);
      localStorage.removeItem(TENANT_KEY);
      return;
    }

    // Scope selection only. Authorization is intentionally simple: any
    // authenticated AzWA user may work with every organization.
    const { data, error } = await supabase.from("organizations").select("id");
    if (error) throw error;

    const rows: TenantMembership[] = ((data ?? []) as OrganizationScopeRow[]).map(
      (organization) => ({
        tenant_id: organization.id,
        role: "admin",
      }),
    );

    setMemberships(rows);

    const stored = localStorage.getItem(TENANT_KEY);
    const validStored = stored && rows.some((scope) => scope.tenant_id === stored);
    const next = validStored ? stored : (rows[0]?.tenant_id ?? null);

    setTenantId(next);
    if (next) localStorage.setItem(TENANT_KEY, next);
    else localStorage.removeItem(TENANT_KEY);
  }, []);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      try {
        await loadOrganizationScopes(data.session?.user.id);
      } finally {
        if (mounted) setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      queueMicrotask(async () => {
        try {
          await loadOrganizationScopes(nextSession?.user.id);
        } finally {
          if (mounted) setLoading(false);
        }
      });
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadOrganizationScopes]);

  const setCurrentTenantId = useCallback(
    (tenantId: string) => {
      if (!memberships.some((scope) => scope.tenant_id === tenantId)) return;
      setTenantId(tenantId);
      localStorage.setItem(TENANT_KEY, tenantId);
    },
    [memberships],
  );

  const refreshMemberships = useCallback(
    () => loadOrganizationScopes(session?.user.id),
    [loadOrganizationScopes, session?.user.id],
  );

  const currentRole: "admin" | null = currentTenantId ? "admin" : null;

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      memberships,
      currentTenantId,
      currentRole,
      setCurrentTenantId,
      refreshMemberships,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [
      session,
      loading,
      memberships,
      currentTenantId,
      currentRole,
      setCurrentTenantId,
      refreshMemberships,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
