import { Navigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        جاري التحقق من الجلسة...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/legacy/login" search={{ from: pathname }} replace />;
  }

  return <>{children}</>;
}
