export type TemplateForm = {
  id: string | null; account_id: string; name: string; language: string;
  category: "UTILITY" | "AUTHENTICATION"; header: string; body: string; footer: string;
  examples: string[]; otpButton: string; securityRecommendation: boolean;
};

/** Build the Meta Graph API `components` array for a template. */
export function buildComponents(f: TemplateForm) {
  if (f.category === "AUTHENTICATION") {
    return [
      { type: "BODY", add_security_recommendation: f.securityRecommendation },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: f.otpButton || "Copy code" }] },
    ];
  }
  const comps: Record<string, unknown>[] = [];
  if (f.header.trim()) comps.push({ type: "HEADER", format: "TEXT", text: f.header.trim() });
  const vars = countVars(f.body);
  comps.push(vars ? { type: "BODY", text: f.body, example: { body_text: [f.examples.slice(0, vars)] } } : { type: "BODY", text: f.body });
  if (f.footer.trim()) comps.push({ type: "FOOTER", text: f.footer.trim() });
  return comps;
}

export function countVars(s: string) {
  const m = s.match(/\{\{(\d+)\}\}/g);
  return m ? Math.max(...m.map(x => Number(x.replace(/\D/g, "")))) : 0;
}

/** Returns an Arabic error message, or null when the template meets Meta's rules. */
export function validateTemplate(f: TemplateForm): string | null {
  if (!f.account_id) return "اختر رقم واتساب";
  if (!/^[a-z0-9_]{1,512}$/.test(f.name)) return "اسم القالب يجب أن يكون حروفاً إنجليزية صغيرة وأرقاماً و _ فقط";
  if (f.category === "AUTHENTICATION") return null;
  if (!f.body.trim()) return "نص الرسالة مطلوب";
  const n = countVars(f.body);
  for (let i = 1; i <= n; i++) if (!f.body.includes(`{{${i}}}`)) return `المتغيرات يجب أن تكون متسلسلة؛ {{${i}}} مفقود`;
  if (f.examples.slice(0, n).filter(e => e?.trim()).length < n) return "أدخل مثالاً لكل متغير — ميتا ترفض القالب بدونه";
  if (/^\s*\{\{\d+\}\}|\{\{\d+\}\}\s*$/.test(f.body)) return "لا يمكن أن يبدأ النص أو ينتهي بمتغير";
  const words = f.body.replace(/\{\{\d+\}\}/g, "").trim().split(/\s+/).filter(Boolean).length;
  if (n && words < n * 3) return "النص قصير مقارنة بعدد المتغيرات؛ اكتب جملة أطول";
  return null;
}
