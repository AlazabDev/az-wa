import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
  const [currentTenantId, setTenantId] = useState<string | null>(() => localStorage.getItem(TENANT_KEY));

  const loadMemberships = async (userId?: string) => {
    const uid = userId ?? session?.user.id;
    if (!uid) {
      setMemberships([]);
      setTenantId(null);
      localStorage.removeItem(TENANT_KEY);
      return;
    }

    const { data, error } = await supabase
      .from("tenant_members")
      .select("tenant_id, role")
      .eq("user_id", uid);

    if (error) throw error;
    const rows = (data ?? []) as TenantMembership[];
    setMemberships(rows);

    const stored = localStorage.getItem(TENANT_KEY);
    const validStored = stored && rows.some((m) => m.tenant_id === stored);
    const next = validStored ? stored : rows[0]?.tenant_id ?? null;
    setTenantId(next);
    if (next) localStorage.setItem(TENANT_KEY, next);
    else localStorage.removeItem(TENANT_KEY);
  };

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
  }, []);

  const setCurrentTenantId = (tenantId: string) => {
    if (!memberships.some((m) => m.tenant_id === tenantId)) return;
    setTenantId(tenantId);
    localStorage.setItem(TENANT_KEY, tenantId);
  };

  const currentRole = memberships.find((m) => m.tenant_id === currentTenantId)?.role ?? null;

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    memberships,
    currentTenantId,
    currentRole,
    setCurrentTenantId,
    refreshMemberships: () => loadMemberships(),
    signOut: async () => { await supabase.auth.signOut(); },
  }), [session, loading, memberships, currentTenantId, currentRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
