import { Navigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, memberships } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

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

  if (memberships.length === 0) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <div>
          <h1 className="text-lg font-semibold">لا توجد صلاحية وصول</h1>
          <p className="text-sm text-muted-foreground mt-2">
            الحساب مسجل بنجاح لكنه غير مرتبط بأي Tenant.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
