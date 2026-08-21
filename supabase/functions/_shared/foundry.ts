// Microsoft Foundry finance extraction.
// Financial data must not silently leave the approved provider boundary.

const PROJECT_ENDPOINT = (Deno.env.get("FOUNDRY_PROJECT_ENDPOINT") ?? "").replace(/\/+$/, "");
const AGENT_ID = Deno.env.get("FOUNDRY_AGENT_ID") ?? "";
const API_VERSION = Deno.env.get("FOUNDRY_API_VERSION") ?? "v1";
const API_KEY = Deno.env.get("FOUNDRY_API_KEY") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const ALLOW_FALLBACK = (Deno.env.get("FINANCE_ALLOW_AI_FALLBACK") ?? "false") === "true";

export function foundryConfigured() {
  return Boolean(PROJECT_ENDPOINT && AGENT_ID && API_KEY);
}

export interface FinanceExtraction {
  doc_type: string | null;
  vendor: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: string | null;
  total_amount: number | null;
  tax_amount: number | null;
  payment_method: string | null;
  reference_number: string | null;
  bank: string | null;
  person: string | null;
  description: string | null;
  financial_category: string | null;
  project_or_cost_center: string | null;
  summary: string | null;
  line_items: { description: string; qty?: number; amount?: number }[];
  confidence: number | null;
  provider: string;
}

const SYSTEM_PROMPT = `أنت وكيل مالي لشركة مقاولات وصيانة. تستلم OCR من مستند مالي. أعد JSON فقط بدون شرح بهذا الشكل:
{"doc_type":"invoice|receipt|purchase_order|statement|bank_transfer|quote|other","vendor":null,"invoice_number":null,"invoice_date":null,"currency":null,"total_amount":null,"tax_amount":null,"payment_method":null,"reference_number":null,"bank":null,"person":null,"description":null,"financial_category":null,"project_or_cost_center":null,"summary":null,"line_items":[],"confidence":null}
استخدم null لكل قيمة غير موجودة صراحة. لا تخترع بيانات أو مشروع أو تصنيف بدون دليل.`;

function parseJson(text: string): Partial<FinanceExtraction> {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return {};
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return {}; }
}

function normalize(raw: Partial<FinanceExtraction>, provider: string): FinanceExtraction {
  const num = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "string" ? parseFloat(v.replace(/[^0-9.\-]/g, "")) : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const str = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
  const date = typeof raw.invoice_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.invoice_date) ? raw.invoice_date : null;
  return {
    doc_type: str(raw.doc_type), vendor: str(raw.vendor), invoice_number: str(raw.invoice_number), invoice_date: date,
    currency: str(raw.currency)?.toUpperCase() ?? null, total_amount: num(raw.total_amount), tax_amount: num(raw.tax_amount),
    payment_method: str(raw.payment_method), reference_number: str(raw.reference_number), bank: str(raw.bank),
    person: str(raw.person), description: str(raw.description), financial_category: str(raw.financial_category),
    project_or_cost_center: str(raw.project_or_cost_center), summary: str(raw.summary),
    line_items: Array.isArray(raw.line_items) ? raw.line_items.slice(0, 100) : [], confidence: num(raw.confidence), provider,
  };
}

function foundryHeaders() {
  // Kept compatible with the currently configured Foundry project. Production deployments
  // should replace FOUNDRY_API_KEY with an Entra token provider when available.
  return { "api-key": API_KEY, "Content-Type": "application/json" };
}

async function runFoundryAgent(prompt: string): Promise<FinanceExtraction> {
  if (!foundryConfigured()) throw new Error("Foundry finance agent is not configured");
  const headers = foundryHeaders();
  const qs = `?api-version=${API_VERSION}`;
  const threadRes = await fetch(`${PROJECT_ENDPOINT}/threads${qs}`, { method: "POST", headers, body: "{}" });
  if (!threadRes.ok) throw new Error(`Foundry thread ${threadRes.status}: ${(await threadRes.text()).slice(0, 300)}`);
  const threadId = (await threadRes.json()).id;
  const msgRes = await fetch(`${PROJECT_ENDPOINT}/threads/${threadId}/messages${qs}`, {
    method: "POST", headers, body: JSON.stringify({ role: "user", content: `${SYSTEM_PROMPT}\n\n---\n${prompt}` }),
  });
  if (!msgRes.ok) throw new Error(`Foundry message ${msgRes.status}: ${(await msgRes.text()).slice(0, 300)}`);
  const runRes = await fetch(`${PROJECT_ENDPOINT}/threads/${threadId}/runs${qs}`, {
    method: "POST", headers, body: JSON.stringify({ assistant_id: AGENT_ID }),
  });
  if (!runRes.ok) throw new Error(`Foundry run ${runRes.status}: ${(await runRes.text()).slice(0, 300)}`);
  let run = await runRes.json();
  for (let i = 0; i < 40 && ["queued", "in_progress", "requires_action"].includes(run.status); i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(`${PROJECT_ENDPOINT}/threads/${threadId}/runs/${run.id}${qs}`, { headers });
    if (!poll.ok) throw new Error(`Foundry poll ${poll.status}`);
    run = await poll.json();
  }
  if (run.status !== "completed") throw new Error(`Foundry run status: ${run.status}`);
  const listRes = await fetch(`${PROJECT_ENDPOINT}/threads/${threadId}/messages${qs}&order=desc&limit=5`, { headers });
  if (!listRes.ok) throw new Error(`Foundry messages ${listRes.status}`);
  const list = await listRes.json();
  const assistantMsg = (list.data ?? []).find((m: any) => m.role === "assistant");
  const text = (assistantMsg?.content ?? []).map((c: any) => c?.text?.value ?? c?.text ?? "").join("\n");
  return normalize(parseJson(text), "foundry");
}

async function runGatewayFallback(prompt: string): Promise<FinanceExtraction> {
  if (!ALLOW_FALLBACK) throw new Error("Foundry failed and finance AI fallback is disabled");
  if (!LOVABLE_API_KEY) throw new Error("Finance fallback enabled but LOVABLE_API_KEY is missing");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-3-flash", messages: [
      { role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt },
    ] }),
  });
  if (!res.ok) {
    const err = new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 300)}`);
    (err as any).status = res.status;
    throw err;
  }
  const json = await res.json();
  return normalize(parseJson(json?.choices?.[0]?.message?.content ?? ""), "lovable-gateway");
}

export async function extractFinanceData(ocrText: string, hints: string[] = []): Promise<FinanceExtraction> {
  const prompt = `نص المستند:\n${ocrText.slice(0, 12000)}\n\nوسوم الصورة: ${hints.join(", ") || "-"}`;
  try {
    return await runFoundryAgent(prompt);
  } catch (e) {
    console.error("Foundry finance extraction failed:", (e as Error).message);
    return await runGatewayFallback(prompt);
  }
}
