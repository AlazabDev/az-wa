import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute() {
  const { user, loading, memberships } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">جاري التحقق من الجلسة...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (memberships.length === 0) {
    return <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="text-lg font-semibold">لا توجد صلاحية وصول</h1>
        <p className="text-sm text-muted-foreground mt-2">الحساب مسجل بنجاح لكنه غير مرتبط بأي Tenant.</p>
      </div>
    </div>;
  }

  return <Outlet />;
}
