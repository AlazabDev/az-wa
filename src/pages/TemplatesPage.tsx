import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Plus, Send, RefreshCw, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceData } from "@/hooks/useWorkspaceData";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeading, DataState, fieldClass } from "@/components/WorkspaceUI";
import { buildComponents, validateTemplate, type TemplateForm } from "@/lib/templates";

const statusLabel: Record<string, string> = { DRAFT: "مسودة", PENDING: "قيد المراجعة", APPROVED: "معتمد", REJECTED: "مرفوض", ERROR: "خطأ", PAUSED: "متوقف", DISABLED: "معطّل" };
const statusTone: Record<string, string> = { APPROVED: "text-primary", REJECTED: "text-destructive", ERROR: "text-destructive", PENDING: "text-warning" };

async function callFn(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("whatsapp-templates", { body });
  if (error) {
    let msg = error.message;
    if (error instanceof FunctionsHttpError) { try { msg = (await error.context.json()).error ?? msg; } catch { /* keep */ } }
    throw new Error(msg);
  }
  return data;
}

const empty = (accountId: string): TemplateForm => ({ id: null, account_id: accountId, name: "", language: "ar", category: "UTILITY", header: "", body: "", footer: "", examples: [], otpButton: "نسخ الرمز", securityRecommendation: true });

export default function TemplatesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const accounts = useWorkspaceData("whatsapp_accounts");
  const list = useQuery({ queryKey: ["message_templates", user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.from("message_templates").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
    if (error) throw error; return data;
  }});
  const [form, setForm] = useState<TemplateForm | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["message_templates", user?.id] });

  async function save(submit: boolean) {
    if (!form || !user) return;
    const err = validateTemplate(form); if (err) return toast.error(err);
    setBusy("save");
    const row = { user_id: user.id, account_id: form.account_id || null, name: form.name, language: form.language, category: form.category, components: buildComponents(form) as never };
    const res = form.id ? await supabase.from("message_templates").update(row).eq("id", form.id).select("id").single() : await supabase.from("message_templates").insert(row).select("id").single();
    if (res.error) { setBusy(null); return toast.error("تعذر الحفظ"); }
    try { if (submit) { await callFn({ action: "submit", template_id: res.data.id }); toast.success("أُرسل القالب إلى ميتا للمراجعة"); } else toast.success("تم حفظ المسودة"); setForm(null); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(null); refresh();
  }
  async function act(action: string, extra: Record<string, unknown>, ok: string) {
    setBusy(action); try { await callFn({ action, ...extra }); toast.success(ok); } catch (e) { toast.error((e as Error).message); } setBusy(null); refresh();
  }
  const firstAcc = accounts.data?.[0]?.id ?? "";

  return <>
    <PageHeading title="قوالب الرسائل" subtitle="أنشئ قوالب خدمية ومصادقة وأرسلها إلى ميتا للاعتماد"
      action={<div className="flex gap-2"><Button variant="outline" disabled={!firstAcc || busy === "sync"} onClick={() => act("sync", { account_id: firstAcc }, "تم تحديث الحالات من ميتا")}><RefreshCw /> مزامنة الحالات</Button><Button onClick={() => setForm(empty(firstAcc))}><Plus /> قالب جديد</Button></div>} />
    {!accounts.isLoading && !firstAcc && <div className="border-r-2 border-warning bg-warning/10 p-4 text-sm mb-6">أضف رقم واتساب مع معرّف حساب الأعمال أولاً لتتمكن من الإرسال للاعتماد.</div>}
    <DataState loading={list.isLoading} error={list.error} retry={() => list.refetch()} empty={!list.data?.length}>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{list.data?.map(t => {
        const body = (t.components as any[])?.find(c => c.type === "BODY")?.text ?? "";
        return <article key={t.id} className="border border-border rounded-lg p-5 bg-card min-w-0">
          <div className="flex justify-between gap-2"><h2 className="font-semibold break-all" dir="ltr">{t.name}</h2><span className={`text-xs font-medium ${statusTone[t.status] ?? "text-muted-foreground"}`}>{statusLabel[t.status] ?? t.status}</span></div>
          <p className="text-xs text-muted-foreground mt-1">{t.category === "AUTHENTICATION" ? "مصادقة" : "خدمي"} · {t.language}</p>
          <p className="text-sm mt-4 whitespace-pre-wrap line-clamp-4 min-h-16">{body}</p>
          {t.rejection_reason && <p className="text-xs text-destructive mt-2">{t.rejection_reason}</p>}
          <div className="flex gap-1 mt-4 pt-3 border-t border-border">
            {["DRAFT", "ERROR", "REJECTED"].includes(t.status) && <Button size="sm" disabled={!!busy} onClick={() => act("submit", { template_id: t.id }, "أُرسل للمراجعة")}><Send /> إرسال للاعتماد</Button>}
            {["DRAFT", "ERROR"].includes(t.status) && <Button variant="ghost" size="icon" aria-label="تعديل" onClick={() => setForm(fromRow(t))}><Pencil /></Button>}
            <Button variant="ghost" size="icon" aria-label="حذف" className="text-destructive mr-auto" disabled={!!busy} onClick={() => { if (confirm("حذف القالب؟ سيُحذف من ميتا أيضاً إن كان مُرسلاً.")) t.meta_template_id ? act("delete", { template_id: t.id }, "تم الحذف") : supabase.from("message_templates").delete().eq("id", t.id).then(refresh); }}><Trash2 /></Button>
          </div>
        </article>;
      })}</div>
    </DataState>
    <Dialog open={!!form} onOpenChange={o => !o && setForm(null)}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>قالب رسالة</DialogTitle><DialogDescription>بعد الإرسال تراجع ميتا القالب، وقد يستغرق ذلك حتى 48 ساعة.</DialogDescription></DialogHeader>
        {form && <div className="grid md:grid-cols-[1fr_260px] gap-6">
          <div className="space-y-3">
            <label className="block text-sm space-y-1"><span>الرقم</span><select className={fieldClass} value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>{accounts.data?.map(a => <option key={a.id} value={a.id}>{a.display_name}{a.waba_id ? "" : " (بدون WABA)"}</option>)}</select></label>
            <label className="block text-sm space-y-1"><span>اسم القالب (حروف إنجليزية صغيرة و _)</span><input dir="ltr" className={fieldClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm space-y-1"><span>التصنيف</span><select className={fieldClass} value={form.category} onChange={e => setForm({ ...form, category: e.target.value as TemplateForm["category"] })}><option value="UTILITY">خدمي</option><option value="AUTHENTICATION">مصادقة (رمز تحقق)</option></select></label>
              <label className="block text-sm space-y-1"><span>اللغة</span><select className={fieldClass} value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}><option value="ar">العربية</option><option value="en_US">English (US)</option><option value="en">English</option></select></label>
            </div>
            {form.category === "UTILITY" ? <>
              <label className="block text-sm space-y-1"><span>العنوان (اختياري)</span><input className={fieldClass} maxLength={60} value={form.header} onChange={e => setForm({ ...form, header: e.target.value })} /></label>
              <label className="block text-sm space-y-1"><span>نص الرسالة — استخدم {"{{1}}"} و {"{{2}}"} للمتغيرات</span><textarea className={`${fieldClass} min-h-28`} maxLength={1024} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></label>
              {varCount(form.body) > 0 && <div className="space-y-2">{Array.from({ length: varCount(form.body) }, (_, i) => <input key={i} placeholder={`مثال للمتغير {{${i + 1}}}`} className={fieldClass} value={form.examples[i] ?? ""} onChange={e => { const ex = [...form.examples]; ex[i] = e.target.value; setForm({ ...form, examples: ex }); }} />)}</div>}
              <label className="block text-sm space-y-1"><span>التذييل (اختياري)</span><input className={fieldClass} maxLength={60} value={form.footer} onChange={e => setForm({ ...form, footer: e.target.value })} /></label>
            </> : <>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.securityRecommendation} onChange={e => setForm({ ...form, securityRecommendation: e.target.checked })} /> إضافة تنبيه "لا تشارك هذا الرمز"</label>
              <label className="block text-sm space-y-1"><span>نص زر النسخ</span><input className={fieldClass} maxLength={25} value={form.otpButton} onChange={e => setForm({ ...form, otpButton: e.target.value })} /></label>
            </>}
            <div className="flex gap-2 pt-2"><Button disabled={!!busy} onClick={() => save(true)}><Send /> حفظ وإرسال للاعتماد</Button><Button variant="outline" disabled={!!busy} onClick={() => save(false)}>حفظ كمسودة</Button></div>
          </div>
          <Preview form={form} />
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}

function varCount(s: string) { const m = s.match(/\{\{(\d+)\}\}/g); return m ? Math.max(...m.map(x => Number(x.replace(/\D/g, "")))) : 0; }
function fromRow(t: any): TemplateForm {
  const c = t.components as any[]; const get = (type: string) => c.find(x => x.type === type);
  return { id: t.id, account_id: t.account_id ?? "", name: t.name, language: t.language, category: t.category, header: get("HEADER")?.text ?? "", body: get("BODY")?.text ?? "", footer: get("FOOTER")?.text ?? "", examples: get("BODY")?.example?.body_text?.[0] ?? [], otpButton: get("BUTTONS")?.buttons?.[0]?.text ?? "نسخ الرمز", securityRecommendation: !!get("BODY")?.add_security_recommendation };
}
function Preview({ form }: { form: TemplateForm }) {
  const fill = (s: string) => s.replace(/\{\{(\d+)\}\}/g, (_, n) => form.examples[Number(n) - 1] || `{{${n}}}`);
  const auth = form.category === "AUTHENTICATION";
  return <div className="rounded-lg bg-muted p-4 self-start"><p className="text-xs text-muted-foreground mb-2">معاينة</p><div className="bg-card rounded-lg p-3 text-sm shadow-sm space-y-2">
    {auth ? <><p><b>123456</b> هو رمز التحقق الخاص بك.{form.securityRecommendation && " لا تشارك هذا الرمز."}</p><div className="border-t border-border pt-2 text-center text-primary">{form.otpButton}</div></>
      : <>{form.header && <p className="font-semibold">{form.header}</p>}<p className="whitespace-pre-wrap">{fill(form.body) || "…"}</p>{form.footer && <p className="text-xs text-muted-foreground">{form.footer}</p>}</>}
  </div></div>;
}
