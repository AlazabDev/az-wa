import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Loader2, LockKeyhole, Mail } from "lucide-react";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — AzWA" },
      {
        name: "description",
        content: "تسجيل الدخول إلى منصة AzWA لإدارة عمليات WhatsApp Business.",
      },
      { property: "og:title", content: "تسجيل الدخول — AzWA" },
      { property: "og:description", content: "منصة إدارة WhatsApp Business المركزية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

type AuthMode = "signin" | "signup";
type OAuthProvider = "google" | "facebook" | "azure";

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-7 shrink-0">
      <path
        fill="#4285F4"
        d="M21.58 12.23c0-.74-.06-1.28-.2-1.84H12v3.64h5.5a4.79 4.79 0 0 1-2.04 3.05l-.02.12 2.96 2.27.2.02c1.84-1.68 2.98-4.16 2.98-7.26Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.88 6.6-2.4l-3.14-2.52c-.84.56-1.98.96-3.46.96-2.6 0-4.8-1.72-5.58-4.1l-.12.01-3.08 2.37-.04.11C4.8 19.7 8.14 22 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.42 13.94A6.1 6.1 0 0 1 6.1 12c0-.68.12-1.34.3-1.94l-.01-.13-3.12-2.4-.1.05A9.94 9.94 0 0 0 2 12c0 1.6.4 3.12 1.18 4.42l3.24-2.48Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.96c1.88 0 3.14.8 3.86 1.46l2.8-2.7C16.94 3.14 14.7 2 12 2 8.14 2 4.8 4.3 3.18 7.58l3.22 2.48C7.2 7.68 9.4 5.96 12 5.96Z"
      />
    </svg>
  );
}

function FacebookMark() {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1877F2] text-[27px] font-bold leading-none text-white"
    >
      f
    </span>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data?.session) void navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  function clearFeedback() {
    setError(null);
    setNotice(null);
  }

  async function submitCredentials(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    clearFeedback();

    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });

        if (signUpError) {
          setError(signUpError.message);
          return;
        }

        if (data.session) {
          await navigate({ to: "/dashboard", replace: true });
          return;
        }

        setNotice("تم إنشاء الحساب. راجع بريدك الإلكتروني لتأكيد الحساب ثم سجّل الدخول.");
        setMode("signin");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(
          signInError.message === "Invalid login credentials"
            ? "البريد الإلكتروني أو كلمة المرور غير صحيحة."
            : signInError.message,
        );
        return;
      }

      await navigate({ to: "/dashboard", replace: true });
    } catch {
      setError("تعذّر الاتصال بخدمة المصادقة. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithOAuth(provider: OAuthProvider, label: string) {
    setOauthBusy(label);
    clearFeedback();

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (oauthError) setError(oauthError.message);
    } catch {
      setError(`تعذّر بدء تسجيل الدخول عبر ${label}.`);
    } finally {
      setOauthBusy(null);
    }
  }

  async function sendPasswordReset() {
    clearFeedback();

    if (!email.trim()) {
      setError("أدخل بريدك الإلكتروني أولًا لاستعادة كلمة المرور.");
      return;
    }

    setBusy(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setNotice("تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني.");
    } catch {
      setError("تعذّر إرسال رابط استعادة كلمة المرور.");
    } finally {
      setBusy(false);
    }
  }

  function unavailableProvider(label: string) {
    clearFeedback();
    setNotice(`${label} ظاهر ضمن بوابة المصادقة، ويحتاج تفعيل موفّر الهوية قبل استخدامه.`);
  }

  const emailReady = email.trim().length > 3;
  const passwordReady = password.length >= 8;
  const disabled = busy || !emailReady || !passwordReady;

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#ececec] px-4 py-8 text-[#0b1739] sm:px-6 sm:py-10"
      dir="rtl"
    >
      <section className="w-full max-w-[860px] rounded-[44px] bg-white px-5 py-8 shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:px-10 sm:py-10 md:px-14 lg:px-16">
        <header className="flex flex-col items-center text-center">
          <img
            src="/alazab.png"
            alt="Alazab"
            className="mb-4 h-[74px] w-auto max-w-[250px] object-contain sm:h-[82px]"
          />
          <h1 className="text-4xl font-bold tracking-tight text-[#071a4b] sm:text-5xl">
            {mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب جديد"}
          </h1>
        </header>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" dir="ltr">
          <button
            type="button"
            onClick={() => void signInWithOAuth("google", "Google")}
            disabled={oauthBusy !== null}
            className="flex h-[66px] items-center justify-center gap-2 rounded-[20px] bg-[#f1f1f1] px-3 text-base font-bold text-black transition hover:bg-[#e8e8e8] disabled:cursor-wait disabled:opacity-70 sm:text-lg"
          >
            {oauthBusy === "Google" ? <Loader2 className="size-6 animate-spin" /> : <GoogleMark />}
            <span>google</span>
          </button>

          <button
            type="button"
            onClick={() => void signInWithOAuth("facebook", "Facebook")}
            disabled={oauthBusy !== null}
            className="flex h-[66px] items-center justify-center gap-2 rounded-[20px] bg-[#f1f1f1] px-3 text-base font-bold text-black transition hover:bg-[#e8e8e8] disabled:cursor-wait disabled:opacity-70 sm:text-lg"
          >
            {oauthBusy === "Facebook" ? (
              <Loader2 className="size-6 animate-spin" />
            ) : (
              <FacebookMark />
            )}
            <span>facebook</span>
          </button>

          <button
            type="button"
            onClick={() => void signInWithOAuth("azure", "AzabEnter")}
            disabled={oauthBusy !== null}
            className="flex h-[66px] items-center justify-center gap-2 rounded-[20px] bg-[#f1f1f1] px-3 text-base font-bold text-black transition hover:bg-[#e8e8e8] disabled:cursor-wait disabled:opacity-70 sm:text-lg"
          >
            {oauthBusy === "AzabEnter" ? (
              <Loader2 className="size-6 animate-spin" />
            ) : (
              <img src="/az.png" alt="" aria-hidden="true" className="size-8 object-contain" />
            )}
            <span>AzabEnter</span>
          </button>

          <button
            type="button"
            onClick={() => unavailableProvider("WhatsApp")}
            className="flex h-[66px] items-center justify-center gap-2 rounded-[20px] bg-[#f1f1f1] px-3 text-base font-bold text-black transition hover:bg-[#e8e8e8] sm:text-lg"
          >
            <img src="/whatsapp.png" alt="" aria-hidden="true" className="size-8 object-contain" />
            <span>Whatsapp</span>
          </button>
        </div>

        <div className="my-8 flex items-center gap-4 text-sm text-[#667085] sm:gap-6 sm:text-lg">
          <span className="h-px flex-1 bg-[#d8dce4]" />
          <span className="whitespace-nowrap">أو بالبريد الإلكتروني</span>
          <span className="h-px flex-1 bg-[#d8dce4]" />
        </div>

        <form onSubmit={submitCredentials} className="space-y-6">
          <div>
            <label htmlFor="email" className="mb-2.5 block text-right text-lg font-medium sm:text-xl">
              البريد الإلكتروني
            </label>
            <div className="relative">
              <Mail
                aria-hidden="true"
                className="pointer-events-none absolute right-5 top-1/2 size-6 -translate-y-1/2 text-[#667085]"
              />
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                dir="ltr"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@alazab.com"
                className="h-[68px] w-full rounded-[16px] border border-[#cbd5e1] bg-[#eaf2ff] px-5 pr-14 text-left text-lg font-medium text-[#101828] outline-none transition placeholder:text-[#344054] focus:border-[#0b1d4d] focus:ring-2 focus:ring-[#0b1d4d]/10 sm:text-xl"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2.5 block text-right text-lg font-medium sm:text-xl"
            >
              كلمة المرور
            </label>
            <div className="relative">
              <LockKeyhole
                aria-hidden="true"
                className="pointer-events-none absolute right-5 top-1/2 size-6 -translate-y-1/2 text-[#667085]"
              />
              <input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={8}
                dir="ltr"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••••"
                className="h-[68px] w-full rounded-[16px] border border-[#cbd5e1] bg-[#eaf2ff] px-5 pr-14 text-left text-xl font-medium tracking-[0.18em] text-[#101828] outline-none transition placeholder:tracking-[0.18em] placeholder:text-[#101828] focus:border-[#0b1d4d] focus:ring-2 focus:ring-[#0b1d4d]/10"
              />
            </div>
          </div>

          {mode === "signin" && (
            <div className="flex items-center justify-between gap-4 text-base sm:text-lg">
              <button
                type="button"
                onClick={() => setRememberMe((value) => !value)}
                className="flex items-center gap-2 text-[#0b1739]"
                aria-pressed={rememberMe}
              >
                <span
                  className={`flex size-7 items-center justify-center rounded-full border transition ${
                    rememberMe
                      ? "border-[#0b1d4d] bg-[#0b1d4d] text-white"
                      : "border-[#a8b0bf] bg-white text-transparent"
                  }`}
                >
                  <Check className="size-5" strokeWidth={3} />
                </span>
                <span>تذكرني</span>
              </button>

              <button
                type="button"
                onClick={() => void sendPasswordReset()}
                className="text-[#123d83] underline-offset-4 hover:underline"
              >
                نسيت كلمة المرور؟
              </button>
            </div>
          )}

          {notice && (
            <p
              role="status"
              className="rounded-xl border border-[#c7d7f4] bg-[#f5f8ff] px-4 py-3 text-sm text-[#173b70]"
            >
              {notice}
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={disabled}
            className="flex h-[76px] w-full items-center justify-center rounded-[17px] bg-[#0c1b46] px-6 text-xl font-semibold text-white shadow-sm transition hover:bg-[#071638] disabled:cursor-not-allowed disabled:opacity-60 sm:text-2xl"
          >
            {busy && <Loader2 className="ml-2 size-6 animate-spin" />}
            {busy
              ? mode === "signin"
                ? "جارٍ تسجيل الدخول…"
                : "جارٍ إنشاء الحساب…"
              : mode === "signin"
                ? "تسجيل الدخول"
                : "إنشاء الحساب"}
          </button>
        </form>

        <div className="mt-8 text-center text-base text-[#667085] sm:text-lg">
          {mode === "signin" ? "ليس لديك حساب؟ " : "لديك حساب بالفعل؟ "}
          <button
            type="button"
            onClick={() => {
              clearFeedback();
              setMode((current) => (current === "signin" ? "signup" : "signin"));
            }}
            className="font-medium text-[#123d83] underline-offset-4 hover:underline"
          >
            {mode === "signin" ? "إنشاء حساب جديد" : "تسجيل الدخول"}
          </button>
        </div>

        <div className="mx-auto mt-10 h-px w-[92%] bg-[#d7dbe2]" />
      </section>
    </main>
  );
}
