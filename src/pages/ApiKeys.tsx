import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import {
  Plus,
  Key,
  Loader2,
  Copy,
  RotateCcw,
  Ban,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTenant } from "@/hooks/use-tenant";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useToast } from "@/hooks/use-toast";
import type { ApiKey } from "@/lib/types";

type ApiKeyWithPlain = ApiKey & { plain?: string };

const SCOPE_OPTIONS = [
  { value: "read:inbox", label: "قراءة صندوق الوارد" },
  { value: "write:messages", label: "إرسال رسائل" },
  { value: "read:contacts", label: "قراءة جهات الاتصال" },
  { value: "read:templates", label: "قراءة القوالب" },
  { value: "read:media", label: "قراءة الوسائط" },
  { value: "write:media", label: "رفع وسائط" },
];

const ApiKeysPage = () => {
  const { tenantId, loading: tenantLoading } = useTenant();
  const { toast } = useToast();

  const [keys, setKeys] = useState<ApiKeyWithPlain[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read:inbox", "write:messages"]);
  const [shownKey, setShownKey] = useState<string | null>(null);

  /* ── Fetch keys ─── */
  const {
    data,
    loading: listLoading,
    refetch,
  } = useApiQuery<{ keys: ApiKey[] }>(
    (api, signal) => api.manageApiKey({ tenant_id: tenantId!, action: "list" }, signal),
    [tenantId],
    { enabled: !!tenantId },
  );

  useEffect(() => {
    if (!data?.keys) return;
    setKeys((prev) => {
      const plainMap = Object.fromEntries(prev.filter((k) => k.plain).map((k) => [k.id, k.plain!]));
      return data.keys.map((k) => ({ ...k, plain: plainMap[k.id] }));
    });
  }, [data]);

  /* ── Create ─── */
  const { mutate: create, loading: creating } = useApiMutation(
    (api, body: { name: string; scopes: string[] }, signal) =>
      api.manageApiKey({ tenant_id: tenantId!, action: "create", ...body }, signal),
    {
      onSuccess: (d: any) => {
        if (d?.key) setShownKey(d.key);
        toast({ title: "تم إنشاء المفتاح" });
        refetch();
      },
      onError: (e) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
    },
  );

  /* ── Disable ─── */
  const { mutate: disable } = useApiMutation(
    (api, keyId: string, signal) =>
      api.manageApiKey({ tenant_id: tenantId!, action: "disable", key_id: keyId }, signal),
    {
      onSuccess: () => {
        toast({ title: "تم التعطيل" });
        refetch();
      },
      onError: (e) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
    },
  );

  /* ── Rotate ─── */
  const { mutate: rotate } = useApiMutation(
    (api, keyId: string, signal) =>
      api.manageApiKey({ tenant_id: tenantId!, action: "rotate", key_id: keyId }, signal),
    {
      onSuccess: (d: any) => {
        if (d?.key) setShownKey(d.key);
        toast({ title: "تم التدوير — احفظ المفتاح الآن" });
        refetch();
      },
      onError: (e) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
    },
  );

  /* ── Delete ─── */
  const { mutate: del } = useApiMutation(
    (api, keyId: string, signal) =>
      api.manageApiKey({ tenant_id: tenantId!, action: "delete", key_id: keyId }, signal),
    {
      onSuccess: () => {
        toast({ title: "تم الحذف" });
        refetch();
      },
      onError: (e) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
    },
  );

  const copy = (text: string, label = "تم النسخ") => {
    navigator.clipboard.writeText(text);
    toast({ title: label });
  };
  const toggleScope = (s: string) =>
    setScopes((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  const handleCreate = async () => {
    if (!newName.trim() || !tenantId) return;
    await create({ name: newName.trim(), scopes });
    setNewName("");
  };

  if (tenantLoading || listLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader title="مفاتيح API" description={`${keys.length} مفتاح`}>
        <Dialog
          open={dialogOpen}
          onOpenChange={(v) => {
            setDialogOpen(v);
            if (!v) {
              setNewName("");
              setShownKey(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              إنشاء مفتاح
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{shownKey ? "احفظ المفتاح الآن" : "مفتاح API جديد"}</DialogTitle>
            </DialogHeader>
            {shownKey ? (
              <div className="space-y-4 py-2">
                <div
                  className="bg-muted rounded-lg p-3.5 border border-border font-mono text-sm break-all"
                  dir="ltr"
                >
                  {shownKey}
                </div>
                <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    يُعرض هذا المفتاح <strong>مرة واحدة فقط</strong>. انسخه الآن.
                  </span>
                </div>
                <Button
                  className="w-full gap-2"
                  onClick={() => {
                    copy(shownKey, "✓ تم نسخ المفتاح");
                    setDialogOpen(false);
                  }}
                >
                  <Copy className="w-4 h-4" /> نسخ وإغلاق
                </Button>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <div>
                  <Label>الاسم</Label>
                  <Input
                    className="mt-1.5"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="مفتاح الإنتاج"
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">الصلاحيات</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SCOPE_OPTIONS.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => toggleScope(s.value)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
                          scopes.includes(s.value)
                            ? "bg-primary/10 border-primary/40 text-primary font-medium"
                            : "border-border text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        <CheckCircle2
                          className={`w-3 h-3 shrink-0 ${scopes.includes(s.value) ? "" : "opacity-0"}`}
                        />
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    className="w-full"
                    onClick={handleCreate}
                    disabled={creating || !newName.trim() || !scopes.length}
                  >
                    {creating && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
                    إنشاء
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="flex items-start gap-2 bg-warning/10 border border-warning/25 rounded-xl p-3.5 mb-5 text-sm">
        <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <span>المفتاح يُعرض مرة واحدة فقط. خزّنه في Vault أو متغير بيئة.</span>
      </div>

      {keys.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-8">
          <EmptyState
            icon={Key}
            title="لا توجد مفاتيح"
            description="أنشئ مفتاحًا للوصول من تطبيقاتك"
          />
        </div>
      ) : (
        <div className="space-y-3 animate-fade-in">
          {keys.map((key) => {
            const isActive = !key.disabled_at;
            const keyScopes = Array.isArray(key.scopes) ? (key.scopes as string[]) : [];
            return (
              <div
                key={key.id}
                className={`bg-card rounded-xl border p-5 ${!isActive && "opacity-60"}`}
              >
                <div className="flex items-start justify-between mb-2.5">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${isActive ? "bg-primary/10" : "bg-muted"}`}
                    >
                      <Key
                        className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold">{key.name}</p>
                        <StatusBadge
                          status={isActive ? "success" : "neutral"}
                          label={isActive ? "نشط" : "معطل"}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-muted-foreground" dir="ltr">
                          {key.key_prefix}••••••••••••••••
                        </span>
                        <button
                          onClick={() => copy(key.key_prefix)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs">
                        إجراءات
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        onClick={() => rotate(key.id)}
                        className="gap-2 text-amber-600 focus:text-amber-600"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> تدوير المفتاح
                      </DropdownMenuItem>
                      {isActive && (
                        <DropdownMenuItem onClick={() => disable(key.id)} className="gap-2">
                          <Ban className="w-3.5 h-3.5" /> تعطيل
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => del(key.id)}
                        className="gap-2 text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> حذف نهائي
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {keyScopes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2.5">
                    {keyScopes.map((s) => (
                      <Badge
                        key={s}
                        variant="outline"
                        className="text-[10px] font-mono px-1.5 py-0"
                      >
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>
                    آخر استخدام:{" "}
                    {key.last_used_at
                      ? new Date(key.last_used_at).toLocaleDateString("ar")
                      : "لم يُستخدم"}
                  </span>
                  <span>أنشئ: {new Date(key.created_at).toLocaleDateString("ar")}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Float banner after rotate outside dialog */}
      {shownKey && !dialogOpen && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border border-warning shadow-xl rounded-xl p-4 w-[min(480px,calc(100vw-2rem))]">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold mb-1">مفتاح جديد — انسخه الآن</p>
              <p className="font-mono text-xs break-all text-muted-foreground" dir="ltr">
                {shownKey}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                copy(shownKey, "✓ تم نسخ المفتاح");
                setShownKey(null);
              }}
            >
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default ApiKeysPage;
