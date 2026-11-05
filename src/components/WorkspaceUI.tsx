import { type ReactNode } from "react";
import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-4 mb-6"><div><h1 className="text-2xl font-bold">{title}</h1>{subtitle && <p className="text-sm text-muted-foreground mt-2">{subtitle}</p>}</div>{action}</div>;
}
export function DataState({ loading, error, empty, retry, children }: { loading?: boolean; error?: unknown; empty?: boolean; retry?: () => void; children?: ReactNode }) {
  if (loading) return <div className="py-20 flex justify-center" role="status"><Loader2 className="animate-spin text-primary" /><span className="sr-only">جارٍ التحميل</span></div>;
  if (error) return <div className="py-16 text-center space-y-3"><AlertCircle className="mx-auto text-destructive" /><p>تعذر تحميل البيانات</p><p className="text-sm text-muted-foreground">تحقق من اتصالك وصلاحية الوصول إلى حسابك.</p>{retry && <Button variant="outline" onClick={retry}><RefreshCw /> إعادة المحاولة</Button>}</div>;
  if (empty) return <div className="py-20 text-center space-y-3"><Inbox className="mx-auto text-muted-foreground" size={32} /><p className="text-muted-foreground">لا توجد بيانات لعرضها</p></div>;
  return <>{children}</>;
}
export const fieldClass = "w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";