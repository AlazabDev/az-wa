import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

type RouteErrorProps = { error: unknown; reset: () => void };

/**
 * Safe, reusable TanStack error boundary for route/loader/render failures.
 * Do not display internal stacks, secrets, or API response bodies to users.
 */
export function RouteErrorRecovery({ error, reset }: RouteErrorProps) {
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    console.error("[AzWA] Route failure", error);
  }, [error]);

  function retry() {
    setRetrying(true);
    try {
      reset();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <main dir="rtl" role="alert" className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <AlertTriangle aria-hidden="true" className="mx-auto size-10 text-destructive" />
        <h1 className="mt-4 text-xl font-bold">تعذر تحميل هذه الصفحة</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          حدث خطأ أثناء تحميل المحتوى. لم تُحذف بياناتك أو تُنهَ جلسة الدخول بسبب هذا الخطأ.
          يمكنك إعادة المحاولة، أو العودة إلى لوحة التحكم.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            disabled={retrying}
            onClick={retry}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            إعادة المحاولة
          </button>
          <a href="/dashboard" className="rounded-lg border border-border px-4 py-2 text-sm font-medium">
            لوحة التحكم
          </a>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          إذا تكرر الخطأ، يُرجى حفظ عنوان الصفحة ووقت حدوثه لمطابقته مع سجلات الخادم.
        </p>
      </section>
    </main>
  );
}
