import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, MessageCircle } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import authSideImage from "@/assets/auth-side.jpg";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — AzWA" },
      {
        name: "description",
        content: "بوابة الدخول الآمنة إلى منصة AzWA لإدارة عمليات WhatsApp Business.",
      },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    let active = true;

    void supabase.auth.getUser().then(({ data, error: userError }) => {
      if (active && !userError && data.user) {
        void navigate({ to: "/dashboard", replace: true });
      }
    });

    return () => {
      active = false;
    };
  }, [navigate]);

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError("أدخل البريد الإلكتروني وكلمة المرور.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError) {
        setError("تعذر تسجيل الدخول. تحقق من بيانات الحساب أو تواصل مع مسؤول النظام.");
        return;
      }

      const { data, error: validationError } = await supabase.auth.getUser();
      if (validationError || !data.user) {
        await supabase.auth.signOut();
        setError("تعذر التحقق من جلسة الدخول. حاول مرة أخرى.");
        return;
      }

      await navigate({ to: "/dashboard", replace: true });
    } catch {
      setError("تعذر الاتصال بخدمة المصادقة الآن. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  async function sendPasswordReset() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("أدخل البريد الإلكتروني أولًا.");
      return;
    }

    setResetBusy(true);
    setError(null);
    setNotice(null);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (resetError) {
        setError("تعذر إكمال طلب الاستعادة الآن. حاول لاحقًا.");
        return;
      }

      setNotice("إذا كان البريد مرتبطًا بحساب معتمد، فستصلك تعليمات استعادة كلمة المرور.");
    } catch {
      setError("تعذر إكمال طلب الاستعادة الآن. حاول لاحقًا.");
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <main dir="rtl" className="flex min-h-screen bg-background text-foreground">
      <section className="relative hidden w-1/2 lg:block">
        <img
          src={authSideImage}
          alt="مساحة عمل واتساب"
          className="absolute inset-0 h-full w-full object-cover"
          width={768}
          height={1024}
        />
        <div className="absolute inset-x-6 bottom-8 rounded-2xl bg-white/95 p-6 shadow-[0_18px_55px_rgba(3,9,87,0.10)] backdrop-blur">
          <h2 className="text-xl font-bold text-foreground">AzWA</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            المحادثات وخدمات الاتصال في مكان واحد
          </p>
        </div>
      </section>

      <section className="flex w-full items-center justify-center px-6 py-10 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-7 flex flex-col items-center text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_30px_rgba(34,197,94,0.35)]">
              <MessageCircle className="size-7" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              نظام إدارة واتساب
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">سجّل الدخول للمتابعة</p>
          </div>

          <form className="space-y-3" onSubmit={submitCredentials}>
            <input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="username"
              required
              aria-label="البريد الإلكتروني"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-white px-3 text-right text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="البريد الإلكتروني"
            />
            <input
              id="auth-password"
              type="password"
              autoComplete="current-password"
              required
              aria-label="كلمة المرور"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-white px-3 text-right text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="كلمة المرور"
            />

            {error ? (
              <p
                role="alert"
                aria-live="polite"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive"
              >
                {error}
              </p>
            ) : null}

            {notice ? (
              <p
                role="status"
                aria-live="polite"
                className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm leading-6 text-primary"
              >
                {notice}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              تسجيل الدخول
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            أو
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            disabled={resetBusy || busy}
            onClick={() => void sendPasswordReset()}
            className="w-full text-center text-sm font-semibold text-primary transition hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resetBusy ? "جارٍ إرسال طلب الاستعادة…" : "نسيت كلمة المرور؟"}
          </button>

          <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">
            لا يوجد تسجيل حسابات عامة من هذه الصفحة. جميع محاولات الوصول تخضع للتحقق من Supabase.
          </p>
        </div>
      </section>
    </main>
  );
}
