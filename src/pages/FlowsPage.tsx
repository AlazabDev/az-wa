import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Play, Save, Trash2, MessageSquare, FileText, MessageCircle, Clock, GitBranch, Globe, Bot, ArrowRight, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeading, DataState, fieldClass } from "@/components/WorkspaceUI";

type Step = { id: string; type: StepType; config: Record<string, string> };
type StepType = "send_text" | "send_template" | "send_interactive" | "wait_response" | "decision" | "webhook" | "ai_agent";
const STEP_TYPES: { type: StepType; label: string; desc: string; icon: typeof MessageSquare; fields: [string, string][] }[] = [
  { type: "send_text", label: "إرسال نص", desc: "إرسال رسالة نصية", icon: MessageSquare, fields: [["text", "النص"]] },
  { type: "send_template", label: "إرسال قالب", desc: "إرسال قالب واتساب معتمد", icon: FileText, fields: [["template", "اسم القالب"], ["params", "قيم المتغيرات (مفصولة بفاصلة)"]] },
  { type: "send_interactive", label: "رسالة تفاعلية", desc: "أزرار أو قائمة اختيارات", icon: MessageCircle, fields: [["text", "النص"], ["buttons", "الأزرار (حتى 3، مفصولة بفاصلة)"]] },
  { type: "wait_response", label: "انتظار الرد", desc: "انتظار رد المستخدم", icon: Clock, fields: [["save_as", "حفظ الرد في متغير"], ["timeout", "المهلة بالدقائق"]] },
  { type: "decision", label: "قرار", desc: "تفرّع حسب شرط", icon: GitBranch, fields: [["variable", "المتغير"], ["equals", "يساوي"]] },
  { type: "webhook", label: "ويبهوك", desc: "طلب HTTP لنظام خارجي", icon: Globe, fields: [["url", "الرابط (HTTPS)"], ["method", "الطريقة (GET/POST)"]] },
  { type: "ai_agent", label: "وكيل ذكاء اصطناعي", desc: "رد ذكي بتعليمات محددة", icon: Bot, fields: [["instructions", "التعليمات"]] },
];
const meta = (t: StepType) => STEP_TYPES.find(s => s.type === t)!;

export default function FlowsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["workflows", user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.from("workflows").select("*").eq("user_id", user!.id).order("updated_at", { ascending: false });
    if (error) throw error; return data;
  }});
  const [openId, setOpenId] = useState<string | null>(null);

  async function create() {
    const { data, error } = await supabase.from("workflows").insert({ user_id: user!.id }).select("id").single();
    if (error) return toast.error("تعذر الإنشاء");
    await qc.invalidateQueries({ queryKey: ["workflows", user?.id] }); setOpenId(data.id);
  }
  const current = list.data?.find(w => w.id === openId);
  if (current) return <Editor key={current.id} wf={current} onClose={() => setOpenId(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["workflows", user?.id] })} />;

  return <>
    <PageHeading title="تدفقات واتساب" subtitle="صمّم ردوداً تلقائية بخطوات متتالية" action={<Button onClick={create}><Plus /> تدفق جديد</Button>} />
    <DataState loading={list.isLoading} error={list.error} retry={() => list.refetch()} empty={!list.data?.length}>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{list.data?.map(w => <button key={w.id} onClick={() => setOpenId(w.id)} className="text-right border border-border rounded-lg p-5 bg-card hover:border-primary transition-colors">
        <div className="flex justify-between"><h2 className="font-semibold">{w.name}</h2><span className="text-xs text-muted-foreground">{w.is_active ? "جاهز" : "مسودة"}</span></div>
        <p className="text-sm text-muted-foreground mt-3">{(w.steps as Step[]).length} خطوة · آخر تعديل {new Date(w.updated_at).toLocaleString("ar-EG")}</p>
      </button>)}</div>
    </DataState>
  </>;
}

function Editor({ wf, onClose, onSaved }: { wf: any; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState<string>(wf.name);
  const [active, setActive] = useState<boolean>(wf.is_active);
  const [trigger, setTrigger] = useState<Record<string, string>>({ type: "keyword", value: "", ...(wf.trigger ?? {}) });
  const [steps, setSteps] = useState<Step[]>(wf.steps ?? []);
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date>(new Date(wf.updated_at));
  useEffect(() => { setDirty(true); }, [name, active, trigger, steps]);
  useEffect(() => { setDirty(false); }, []);

  async function save() {
    const { error } = await supabase.from("workflows").update({ name, is_active: active, trigger: trigger as never, steps: steps as never }).eq("id", wf.id);
    if (error) return toast.error("تعذر الحفظ");
    setDirty(false); setSavedAt(new Date()); toast.success("تم الحفظ"); onSaved();
  }
  async function remove() { if (!confirm("حذف التدفق؟")) return; await supabase.from("workflows").delete().eq("id", wf.id); onSaved(); onClose(); }
  function add(type: StepType) { const s = { id: crypto.randomUUID(), type, config: {} }; setSteps([...steps, s]); setSelected(s.id); setMenu(false); }
  function test() {
    const issues = steps.filter(s => meta(s.type).fields.some(([k]) => !s.config[k]?.trim())).length;
    if (!trigger.value?.trim() && trigger.type === "keyword") return toast.error("حدد الكلمة المفتاحية للمُشغّل");
    issues ? toast.error(`${issues} خطوة غير مكتملة الإعداد`) : toast.success("التدفق مكتمل الإعداد");
  }
  const sel = steps.find(s => s.id === selected);

  return <div className="-m-6 flex flex-col min-h-[calc(100vh-4rem)]">
    <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3">
      <Button variant="ghost" size="icon" aria-label="رجوع" onClick={onClose}><ArrowRight /></Button>
      <input aria-label="اسم التدفق" value={name} onChange={e => setName(e.target.value)} className="text-lg font-bold bg-transparent focus:outline-none min-w-0 w-56" />
      <Switch checked={active} onCheckedChange={setActive} aria-label="جاهز للتشغيل" />
      <span className="text-xs text-warning">{active ? "جاهز" : "مسودة"}</span>
      <span className="text-xs text-muted-foreground">حُفظ {savedAt.toLocaleTimeString("ar-EG")}</span>
      <div className="mr-auto flex gap-2">
        <Button variant="outline" size="sm" onClick={remove} className="text-destructive"><Trash2 /> حذف</Button>
        <Button variant="outline" size="sm" disabled={!dirty} onClick={save}><Save /> حفظ</Button>
        <Button variant="outline" size="sm" onClick={test}><Play /> فحص</Button>
      </div>
    </header>
    <div className="flex flex-1 min-h-0">
      <div className="relative flex-1 overflow-auto p-6" style={{ backgroundImage: "radial-gradient(hsl(var(--border)) 1px, transparent 1px)", backgroundSize: "16px 16px" }}>
        <div className="relative inline-block">
          <Button onClick={() => setMenu(!menu)}><Plus /> إضافة خطوة</Button>
          {menu && <div className="absolute z-10 mt-2 w-72 rounded-lg border border-border bg-popover shadow-lg py-1">{STEP_TYPES.map(s => <button key={s.type} onClick={() => add(s.type)} className="flex w-full gap-3 px-4 py-2.5 text-right hover:bg-muted"><s.icon size={18} className="mt-0.5 shrink-0" /><span><span className="block text-sm font-medium">{s.label}</span><span className="block text-xs text-muted-foreground">{s.desc}</span></span></button>)}</div>}
        </div>
        <div className="flex flex-col items-center gap-0 py-8">
          <button onClick={() => setSelected("trigger")} className={`w-80 rounded-xl border-2 border-dashed ${selected === "trigger" ? "border-primary bg-primary/5" : "border-primary"} bg-card p-6 text-right`}>
            <div className="flex items-center gap-3 text-xl font-bold"><Play /> البداية</div>
            <p className="mt-3 text-muted-foreground">{trigger.type === "any" ? "أي رسالة واردة" : trigger.value ? `عند استلام: "${trigger.value}"` : "+ اضغط لإعداد المُشغّل"}</p>
          </button>
          {steps.map((s, i) => { const m = meta(s.type); return <div key={s.id} className="flex flex-col items-center">
            <div className="h-8 w-0.5 bg-primary" />
            <button onClick={() => setSelected(s.id)} className={`w-80 rounded-xl border ${selected === s.id ? "border-primary ring-2 ring-primary/30" : "border-border"} bg-card p-4 text-right shadow-sm`}>
              <div className="flex items-center gap-2 font-semibold"><m.icon size={18} className="text-primary" /> {i + 1}. {m.label}</div>
              <p className="text-xs text-muted-foreground mt-1 truncate">{Object.values(s.config).filter(Boolean).join(" · ") || "غير مُعد"}</p>
            </button>
          </div>; })}
        </div>
      </div>
      {selected && <aside className="w-80 shrink-0 border-r border-border bg-card p-4 space-y-3 overflow-y-auto">
        <div className="flex justify-between items-center"><h2 className="font-semibold">{selected === "trigger" ? "المُشغّل" : sel && meta(sel.type).label}</h2><Button variant="ghost" size="icon" aria-label="إغلاق" onClick={() => setSelected(null)}><X /></Button></div>
        {selected === "trigger" ? <>
          <label className="block text-sm space-y-1"><span>النوع</span><select className={fieldClass} value={trigger.type} onChange={e => setTrigger({ ...trigger, type: e.target.value })}><option value="keyword">كلمة مفتاحية</option><option value="any">أي رسالة واردة</option></select></label>
          {trigger.type === "keyword" && <label className="block text-sm space-y-1"><span>الكلمة</span><input className={fieldClass} value={trigger.value ?? ""} onChange={e => setTrigger({ ...trigger, value: e.target.value })} /></label>}
        </> : sel && <>
          {meta(sel.type).fields.map(([k, label]) => <label key={k} className="block text-sm space-y-1"><span>{label}</span>
            {k === "text" || k === "instructions" ? <textarea className={`${fieldClass} min-h-24`} value={sel.config[k] ?? ""} onChange={e => setSteps(steps.map(s => s.id === sel.id ? { ...s, config: { ...s.config, [k]: e.target.value } } : s))} />
              : <input className={fieldClass} value={sel.config[k] ?? ""} onChange={e => setSteps(steps.map(s => s.id === sel.id ? { ...s, config: { ...s.config, [k]: e.target.value } } : s))} />}
          </label>)}
          <Button variant="outline" className="text-destructive w-full" onClick={() => { setSteps(steps.filter(s => s.id !== sel.id)); setSelected(null); }}><Trash2 /> حذف الخطوة</Button>
        </>}
      </aside>}
    </div>
  </div>;
}
