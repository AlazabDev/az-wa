import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { legacySupabase as supabase } from "@/integrations/supabase/legacy-client";

export type TenantMembership = {
  tenant_id: string;
  role: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  memberships: TenantMembership[];
  currentTenantId: string | null;
  currentRole: string | null;
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

  const loadMemberships = useCallback(async (userId?: string) => {
    if (!userId) {
      setMemberships([]);
      setTenantId(null);
      localStorage.removeItem(TENANT_KEY);
      return;
    }

    const { data, error } = await supabase.from("tenants").select("id");
    if (error) throw error;

    const rows: TenantMembership[] = (data ?? []).map((tenant) => ({
      tenant_id: tenant.id,
      role: "admin",
    }));
    setMemberships(rows);

    const stored = localStorage.getItem(TENANT_KEY);
    const validStored = stored && rows.some((membership) => membership.tenant_id === stored);
    const next = validStored ? stored : (rows[0]?.tenant_id ?? null);
    setTenantId(next);
    if (next) localStorage.setItem(TENANT_KEY, next);
    else localStorage.removeItem(TENANT_KEY);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      try {
        await loadMemberships(data.session?.user.id);
      } finally {
        if (mounted) setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      queueMicrotask(async () => {
        try {
          await loadMemberships(nextSession?.user.id);
        } finally {
          if (mounted) setLoading(false);
        }
      });
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadMemberships]);

  const setCurrentTenantId = useCallback(
    (tenantId: string) => {
      if (!memberships.some((membership) => membership.tenant_id === tenantId)) return;
      setTenantId(tenantId);
      localStorage.setItem(TENANT_KEY, tenantId);
    },
    [memberships],
  );

  const refreshMemberships = useCallback(
    () => loadMemberships(session?.user.id),
    [loadMemberships, session?.user.id],
  );

  const currentRole = currentTenantId ? "admin" : null;

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
