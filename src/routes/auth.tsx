import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

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
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-[#f4f5f7] px-4 py-10 text-[#030957]"
    >
      <section className="w-full max-w-md rounded-2xl border border-black/5 bg-white p-6 shadow-[0_18px_55px_rgba(3,9,87,0.08)] sm:p-8">
        <header className="mb-7 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-[#FFB900]/50 bg-[#FFB900]/10">
            <ShieldCheck className="size-7" aria-hidden="true" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#030957]/55">AzWA</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">تسجيل الدخول</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            بوابة تشغيل داخلية لمجموعة العزب. الدخول متاح للحسابات المعتمدة فقط.
          </p>
        </header>

        <form className="space-y-4" onSubmit={submitCredentials}>
          <label className="block text-sm font-semibold" htmlFor="auth-email">
            البريد الإلكتروني
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pr-10 pl-3 text-left text-sm text-slate-900 outline-none transition focus:border-[#FFB900] focus:ring-2 focus:ring-[#FFB900]/20"
              placeholder="name@alazab.com"
            />
          </div>

          <label className="block text-sm font-semibold" htmlFor="auth-password">
            كلمة المرور
          </label>
          <div className="relative">
            <LockKeyhole
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="auth-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pr-10 pl-3 text-left text-sm text-slate-900 outline-none transition focus:border-[#FFB900] focus:ring-2 focus:ring-[#FFB900]/20"
            />
          </div>

          {error ? (
            <p
              role="alert"
              aria-live="polite"
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700"
            >
              {error}
            </p>
          ) : null}

          {notice ? (
            <p
              role="status"
              aria-live="polite"
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-700"
            >
              {notice}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#030957] px-4 text-sm font-bold text-white transition hover:bg-[#030957]/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            دخول آمن
          </button>
        </form>

        <button
          type="button"
          disabled={resetBusy || busy}
          onClick={() => void sendPasswordReset()}
          className="mt-4 w-full text-center text-sm font-semibold text-[#030957]/70 transition hover:text-[#030957] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {resetBusy ? "جارٍ إرسال طلب الاستعادة…" : "نسيت كلمة المرور؟"}
        </button>

        <footer className="mt-7 border-t border-slate-100 pt-5 text-center text-xs leading-5 text-slate-400">
          لا يوجد تسجيل حسابات عامة من هذه الصفحة. جميع محاولات الوصول تخضع للتحقق من Supabase.
        </footer>
      </section>
    </main>
  );
}
