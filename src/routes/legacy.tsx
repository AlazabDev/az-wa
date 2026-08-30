import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const LEGACY_ENABLED = import.meta.env.VITE_ENABLE_LEGACY_UI === "true";

export const Route = createFileRoute("/legacy")({
  ssr: false,
  beforeLoad: () => {
    if (!LEGACY_ENABLED) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: () => (
    <ErrorBoundary>
      <AuthProvider>
        <TooltipProvider>
          <Outlet />
        </TooltipProvider>
      </AuthProvider>
    </ErrorBoundary>
  ),
});
