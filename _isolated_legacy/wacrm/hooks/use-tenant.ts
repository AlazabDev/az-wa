import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface TenantInfo {
  tenantId: string | null;
  tenantName: string | null;
  role: string | null;
  loading: boolean;
}

export function useTenant(): TenantInfo {
  const { user } = useAuth();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTenantId(null);
      setTenantName(null);
      setRole(null);
      setLoading(false);
      return;
    }

    const fetchTenant = async () => {
      // Use a typed select that returns tenants as a nested object
      const { data } = await (supabase.from as any)("tenant_members")
        .select("tenant_id, role, tenants(name)")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (data) {
        setTenantId((data as any).tenant_id);
        setRole((data as any).role);
        // tenants is a one-to-one FK so Supabase returns an object, not an array
        const tenant = (data as any).tenants as { name: string } | null;
        setTenantName(tenant?.name ?? null);
      }
      setLoading(false);
    };

    fetchTenant();
  }, [user]);

  return { tenantId, tenantName, role, loading };
}
