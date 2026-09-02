import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthMode = "password" | "magic" | "otp";

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

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    setNotice(null);
    setOtp("");
    setOtpSent(false);
  }

  async function signInWithPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
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
      setError("تعذّر الاتصال بخدمة تسجيل الدخول. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMagicLink() {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (otpError) {
        setError(otpError.message);
        return;
      }

      setNotice("تم إرسال رابط تسجيل الدخول إلى بريدك الإلكتروني.");
    } catch {
      setError("تعذّر إرسال رابط تسجيل الدخول.");
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp() {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
        },
      });

      if (otpError) {
        setError(otpError.message);
        return;
      }

      setOtpSent(true);
      setNotice("تم إرسال رمز الدخول إلى بريدك الإلكتروني.");
    } catch {
      setError("تعذّر إرسال رمز الدخول.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: "email",
      });

      if (verifyError) {
        setError(verifyError.message);
        return;
      }

      await navigate({ to: "/dashboard", replace: true });
    } catch {
      setError("تعذّر التحقق من رمز الدخول.");
    } finally {
      setBusy(false);
    }
  }

  const emailReady = email.trim().length > 3;

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary px-4" dir="rtl">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
            A
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight">AzWA</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              WhatsApp Business Operations OS
            </div>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "password" ? "default" : "outline"}
            onClick={() => switchMode("password")}
          >
            كلمة المرور
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "magic" ? "default" : "outline"}
            onClick={() => switchMode("magic")}
          >
            Magic Link
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "otp" ? "default" : "outline"}
            onClick={() => switchMode("otp")}
          >
            OTP
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              dir="ltr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          {mode === "password" && (
            <form onSubmit={signInWithPassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={8}
                  dir="ltr"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy || !emailReady}>
                {busy ? "جارٍ تسجيل الدخول…" : "تسجيل الدخول"}
              </Button>
            </form>
          )}

          {mode === "magic" && (
            <Button
              type="button"
              className="w-full"
              disabled={busy || !emailReady}
              onClick={() => void sendMagicLink()}
            >
              {busy ? "جارٍ الإرسال…" : "إرسال رابط تسجيل الدخول"}
            </Button>
          )}

          {mode === "otp" && (
            <form onSubmit={verifyOtp} className="space-y-4">
              {!otpSent ? (
                <Button
                  type="button"
                  className="w-full"
                  disabled={busy || !emailReady}
                  onClick={() => void sendOtp()}
                >
                  {busy ? "جارٍ الإرسال…" : "إرسال رمز OTP"}
                </Button>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="otp">رمز الدخول</Label>
                    <Input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      dir="ltr"
                      value={otp}
                      onChange={(event) => setOtp(event.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy || otp.trim().length < 6}>
                    {busy ? "جارٍ التحقق…" : "تأكيد الرمز"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={busy}
                    onClick={() => void sendOtp()}
                  >
                    إعادة إرسال الرمز
                  </Button>
                </>
              )}
            </form>
          )}

          {notice && (
            <p className="text-xs text-muted-foreground" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
