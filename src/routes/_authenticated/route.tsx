import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/azwa/app-shell";
import { RouteErrorRecovery } from "@/components/azwa/route-error";
import { supabase } from "@/integrations/supabase/client";
import { getAuthenticatedOrganizationScopes } from "@/lib/auth-scopes.functions";
import { ScopeProvider } from "@/lib/scope";

function AuthPending() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Loading AzWA…</p>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Transient network/server failures should render the retryable route
    // boundary, not silently sign users out or redirect them to /auth.
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
    const result = await Promise.race([supabase.auth.getUser(), timeout]);
    if (result === null) {
      throw new Error("Authentication service timeout — please retry");
    }
    if (result.error) {
      const status = result.error.status;
      if (status === 401 || status === 403) throw redirect({ to: "/auth" });
      throw new Error("Unable to verify session with Supabase");
    }
    if (!result.data.user) throw redirect({ to: "/auth" });

    // Server authorization still requires active organization membership.
    // Database/network errors propagate to the retry boundary; only a
    // verified absence of membership blocks access.
    const scopes = await getAuthenticatedOrganizationScopes({ data: {} });
    if (!scopes.length) throw redirect({ to: "/auth" });
    return { user: result.data.user };
  },
  errorComponent: RouteErrorRecovery,
  pendingComponent: AuthPending,
  pendingMs: 0,
  component: () => (
    <ScopeProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </ScopeProvider>
  ),
});
