import { createFileRoute, Outlet } from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const Route = createFileRoute("/legacy")({
  ssr: false,
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
