import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/azwa/app-shell";
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
    // Production access is granted only after Supabase validates the current user.
    // Never fall back to browser-controlled preview/local storage values.
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
    const result = await Promise.race([supabase.auth.getUser(), timeout]);

    if (!result || result.error || !result.data.user) {
      throw redirect({ to: "/auth" });
    }

    // A valid Supabase account alone is not sufficient for AzWA access.
    // The server function verifies the bearer token again and returns only active
    // organization memberships from the protected runtime schema.
    try {
      const scopes = await getAuthenticatedOrganizationScopes({ data: {} });
      if (scopes.length === 0) {
        await supabase.auth.signOut();
        throw redirect({ to: "/auth" });
      }
    } catch (error) {
      if (error && typeof error === "object" && "redirect" in error) throw error;
      throw redirect({ to: "/auth" });
    }

    return { user: result.data.user };
  },
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
