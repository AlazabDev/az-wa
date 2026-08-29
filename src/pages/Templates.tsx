import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Send, Eye, Search } from "lucide-react";

interface TemplateRow {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  wabaName: string;
  bodyText: string;
  hasButtons: boolean;
  buttonTexts: string[];
  headerType?: string;
}

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  APPROVED: { label: "معتمد", variant: "default" },
  PENDING: { label: "قيد المراجعة", variant: "secondary" },
  REJECTED: { label: "مرفوض", variant: "destructive" },
  DRAFT: { label: "مسودة", variant: "outline" },
};

const categoryMap: Record<string, string> = {
  MARKETING: "تسويقي",
  UTILITY: "خدمي",
  AUTHENTICATION: "مصادقة",
};

const languageMap: Record<string, string> = {
  ar: "عربي",
  en: "إنجليزي",
  en_US: "إنجليزي",
};

function readButtons(meta: unknown): string[] {
  const components = (meta as { components?: unknown[] })?.components;
  if (!Array.isArray(components)) return [];
  const buttonComponent = components.find((c) => (c as { type?: string })?.type?.toUpperCase() === "BUTTONS") as
    | { buttons?: { text?: string }[] }
    | undefined;
  return (buttonComponent?.buttons ?? []).map((b) => b?.text ?? "").filter(Boolean);
}

function readHeaderType(meta: unknown): string | undefined {
  const components = (meta as { components?: unknown[] })?.components;
  if (!Array.isArray(components)) return undefined;
  const header = components.find((c) => (c as { type?: string })?.type?.toUpperCase() === "HEADER") as
    | { format?: string }
    | undefined;
  return header?.format?.toUpperCase();
}

export default function Templates() {
  const { currentTenantId } = useAuth();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterWaba, setFilterWaba] = useState("all");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["templates", currentTenantId],
    enabled: Boolean(currentTenantId),
    queryFn: async (): Promise<TemplateRow[]> => {
      const { data, error } = await supabase.from("templates")
        .select("id,name,category,language,status,body,meta,wa_account_id,wa_accounts(label)")
        .eq("tenant_id", currentTenantId!)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((t) => {
        const buttonTexts = readButtons(t.meta);
        return {
          id: t.id,
          name: t.name,
          category: String(t.category ?? "UTILITY").toUpperCase(),
          language: t.language ?? "ar",
          status: String(t.status ?? "DRAFT").toUpperCase(),
          wabaName: (t.wa_accounts as { label?: string } | null)?.label ?? "—",
          bodyText: t.body ?? "",
          hasButtons: buttonTexts.length > 0,
          buttonTexts,
          headerType: readHeaderType(t.meta),
        };
      });
    },
  });

  const wabaNames = useMemo(() => [...new Set(templates.map((t) => t.wabaName))], [templates]);

  const filtered = templates.filter((t) => {
    const matchSearch = t.name.includes(search) || t.bodyText.includes(search);
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    const matchCategory = filterCategory === "all" || t.category === filterCategory;
    const matchWaba = filterWaba === "all" || t.wabaName === filterWaba;
    return matchSearch && matchStatus && matchCategory && matchWaba;
  });

  return (
    <AppLayout
      title="القوالب"
      subtitle={`${templates.length} قالب عبر ${wabaNames.length} حسابات WABA`}
      actions={
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" className="gradient-primary text-primary-foreground">
              <Plus className="h-4 w-4 ml-1" />
              إنشاء قالب
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl" dir="rtl">
            <DialogHeader><DialogTitle>إنشاء قالب جديد</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="space-y-4">
                <div><Label>اسم القالب</Label><Input placeholder="مثال: إشعار_صيانة" className="mt-1" /></div>
                <div><Label>حساب WABA</Label>
                  <Select><SelectTrigger className="mt-1"><SelectValue placeholder="اختر الحساب" /></SelectTrigger>
                    <SelectContent>
                      {wabaNames.map(name => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>التصنيف</Label>
                  <Select><SelectTrigger className="mt-1"><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MARKETING">تسويقي</SelectItem>
                      <SelectItem value="UTILITY">خدمي</SelectItem>
                      <SelectItem value="AUTHENTICATION">مصادقة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>اللغة</Label>
                  <Select><SelectTrigger className="mt-1"><SelectValue placeholder="اختر اللغة" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ar">العربية</SelectItem>
                      <SelectItem value="en">الإنجليزية</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>نص الرسالة</Label>
                  <Textarea placeholder="اكتب نص القالب... استخدم {{1}} للمتغيرات" className="mt-1 min-h-[100px]" />
                  <p className="text-xs text-muted-foreground mt-1">استخدم {"{{1}}"}, {"{{2}}"} أو {"{{param_name}}"} لإضافة متغيرات</p>
                </div>
              </div>
              <div>
                <Label className="mb-2 block">معاينة</Label>
                <div className="rounded-2xl border bg-muted/30 p-4 min-h-[300px]">
                  <div className="bg-card rounded-xl p-4 shadow-card max-w-[250px] mr-auto">
                    <p className="text-sm leading-relaxed text-foreground">مرحباً {"{{1}}"}، تم تحديد موعد الصيانة يوم {"{{2}}"}.</p>
                    <p className="text-[10px] text-muted-foreground mt-2 text-left" dir="ltr">12:30 PM ✓✓</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline">حفظ كمسودة</Button>
              <Button className="gradient-primary text-primary-foreground">
                <Send className="h-4 w-4 ml-1" />إرسال للموافقة
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="بحث في القوالب..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الحالات</SelectItem>
              <SelectItem value="APPROVED">معتمد</SelectItem>
              <SelectItem value="PENDING">قيد المراجعة</SelectItem>
              <SelectItem value="REJECTED">مرفوض</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الأنواع</SelectItem>
              <SelectItem value="UTILITY">خدمي</SelectItem>
              <SelectItem value="MARKETING">تسويقي</SelectItem>
              <SelectItem value="AUTHENTICATION">مصادقة</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterWaba} onValueChange={setFilterWaba}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الحسابات</SelectItem>
              {wabaNames.map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground">{filtered.length} قالب من أصل {templates.length}</p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">جاري التحميل...</p>
        ) : templates.length === 0 ? (
          <Card className="shadow-card"><CardContent className="p-8 text-center text-sm text-muted-foreground">
            لا توجد قوالب مرتبطة بهذا الـ Tenant بعد.
          </CardContent></Card>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((template) => {
            const status = statusMap[template.status] || statusMap.DRAFT;
            return (
              <Card key={template.id} className="shadow-card hover:shadow-card-hover transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm font-semibold font-mono" dir="ltr">{template.name}</CardTitle>
                    <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                  </div>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{categoryMap[template.category] || template.category}</Badge>
                    <Badge variant="outline" className="text-[10px]">{languageMap[template.language] || template.language}</Badge>
                    {template.hasButtons && <Badge variant="outline" className="text-[10px]">أزرار</Badge>}
                    {template.headerType && <Badge variant="outline" className="text-[10px]">{template.headerType === "IMAGE" ? "صورة" : template.headerType === "VIDEO" ? "فيديو" : "عنوان"}</Badge>}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-2 line-clamp-3 leading-relaxed">{template.bodyText}</p>
                  {template.buttonTexts.length > 0 && (
                    <div className="flex gap-1 flex-wrap mb-2">
                      {template.buttonTexts.map((btn, idx) => (
                        <span key={idx} className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5">{btn}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground">WABA: {template.wabaName}</p>
                    <Button variant="outline" size="sm" className="text-xs h-7"><Eye className="h-3 w-3 ml-1" />معاينة</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        )}
      </div>
    </AppLayout>
  );
}
