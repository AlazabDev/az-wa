import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/azwa/app-shell";
import { supabase } from "@/integrations/supabase/client";
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
