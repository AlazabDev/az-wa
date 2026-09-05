import { FormEvent, useState } from "react";
import { Navigate, useNavigate, useSearch } from "@tanstack/react-router";
import { legacySupabase as supabase } from "@/integrations/supabase/legacy-client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, KeyRound, Link2, Loader2 } from "lucide-react";

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { from?: string };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passwordlessSubmitting, setPasswordlessSubmitting] = useState(false);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  if (!loading && user) return <Navigate to="/legacy" replace />;

  const destination = search.from ?? "/legacy";

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }

    navigate({ to: destination, replace: true });
  };

  const sendPasswordless = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("أدخل البريد الإلكتروني أولاً");
      return;
    }

    setPasswordlessSubmitting(true);
    setError(null);
    setNotice(null);

    const redirectTo = `${window.location.origin}${destination}`;
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectTo,
      },
    });

    setPasswordlessSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }

    setOtpSent(true);
    setNotice("تم إرسال رسالة تسجيل الدخول. استخدم الرابط أو رمز OTP الموجود في البريد.");
  };

  const verifyOtp = async () => {
    const normalizedEmail = email.trim();
    const token = otp.trim();
    if (!normalizedEmail || !token) {
      setError("أدخل البريد ورمز OTP");
      return;
    }

    setOtpSubmitting(true);
    setError(null);
    setNotice(null);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token,
      type: "email",
    });

    setOtpSubmitting(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    navigate({ to: destination, replace: true });
  };

  return (
    <div className="min-h-screen bg-muted/30 grid place-items-center p-4" dir="rtl">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-xl gradient-primary grid place-items-center">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle>WhatsApp Business Hub</CardTitle>
          <CardDescription>
            تسجيل دخول موحد للمستخدمين المعتمدين. جميع الحسابات المسجلة لها نفس صلاحيات AzWA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form className="space-y-4" onSubmit={submitPassword}>
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                dir="ltr"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                dir="ltr"
              />
            </div>

            <Button className="w-full" type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              تسجيل الدخول
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">أو بدون كلمة مرور</span>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              className="w-full"
              type="button"
              variant="outline"
              onClick={sendPasswordless}
              disabled={passwordlessSubmitting}
            >
              {passwordlessSubmitting ? (
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4 ml-2" />
              )}
              إرسال Magic Link / OTP
            </Button>

            {otpSent && (
              <div className="space-y-2">
                <Label htmlFor="otp">رمز OTP</Label>
                <div className="flex gap-2" dir="ltr">
                  <Input
                    id="otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(event) => setOtp(event.target.value)}
                    placeholder="000000"
                  />
                  <Button type="button" onClick={verifyOtp} disabled={otpSubmitting}>
                    {otpSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="h-4 w-4" />
                    )}
                    <span className="mr-2">تحقق</span>
                  </Button>
                </div>
              </div>
            )}
          </div>

          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
