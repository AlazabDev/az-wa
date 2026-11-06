import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getAuthenticatedOrganizationScopes } from "@/lib/auth-scopes.functions";

interface TenantInfo {
  tenantId: string | null;
  tenantName: string | null;
  role: string | null;
  loading: boolean;
}

/**
 * Legacy media-hook compatibility adapter.
 * Organization access comes exclusively from the authenticated server
 * membership contract, not from client-controlled localStorage or the old
 * tenant_members table. Do not use this hook to authorize server operations.
 */
export function useTenant(): TenantInfo {
  const loadScopes = useServerFn(getAuthenticatedOrganizationScopes);
  const { data: scopes, isLoading } = useQuery({
    queryKey: ["authenticated-organization-scopes"],
    queryFn: () => loadScopes({ data: {} }),
    retry: false,
    staleTime: 60_000,
  });
  const selected = scopes?.[0];
  return {
    tenantId: selected?.tenant_id ?? null,
    tenantName: null,
    role: selected?.role ?? null,
    loading: isLoading,
  };
}
