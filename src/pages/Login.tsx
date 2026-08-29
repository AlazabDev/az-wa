import { FormEvent, useState } from "react";
import { Navigate, useNavigate, useSearch } from "@tanstack/react-router";
import { legacySupabase as supabase } from "@/integrations/supabase/legacy-client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Loader2 } from "lucide-react";

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { from?: string };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/legacy" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    const from = search.from ?? "/legacy";
    navigate({ to: from, replace: true });
  };

  return (
    <div className="min-h-screen bg-muted/30 grid place-items-center p-4" dir="rtl">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-xl gradient-primary grid place-items-center">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle>WhatsApp Business Hub</CardTitle>
          <CardDescription>سجّل الدخول بحساب مصرح له للوصول إلى حسابات واتساب والعمليات المالية.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" />
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button className="w-full" type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              تسجيل الدخول
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
