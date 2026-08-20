// Microsoft Foundry agent (az-agent-finance) — extracts structured finance data.
// Falls back to the Lovable AI Gateway if Foundry is unavailable, so a 300-image
// batch never stalls silently.

const PROJECT_ENDPOINT = (Deno.env.get("FOUNDRY_PROJECT_ENDPOINT") ?? "").replace(/\/+$/, "");
const AGENT_ID = Deno.env.get("FOUNDRY_AGENT_ID") ?? "";
const API_VERSION = Deno.env.get("FOUNDRY_API_VERSION") ?? "v1";
const API_KEY = Deno.env.get("FOUNDRY_API_KEY") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

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
  summary: string | null;
  line_items: { description: string; qty?: number; amount?: number }[];
  confidence: number | null;
  provider: string;
}

const SYSTEM_PROMPT = `أنت وكيل مالي لشركة مقاولات وصيانة. تستلم نص مستخرج (OCR) من صورة مستند مالي
(فاتورة، إيصال، أمر شراء، مستخلص، كشف حساب). استخرج البيانات وأعد JSON فقط بهذا الشكل بدون أي شرح:
{"doc_type":"invoice|receipt|purchase_order|statement|quote|other","vendor":"","invoice_number":"","invoice_date":"YYYY-MM-DD","currency":"EGP|SAR|USD|...","total_amount":0,"tax_amount":0,"summary":"سطر عربي مختصر","line_items":[{"description":"","qty":0,"amount":0}],"confidence":0.0}
استخدم null للحقول غير الموجودة. الأرقام بدون فواصل. لا تخترع بيانات.`;

function parseJson(text: string): Partial<FinanceExtraction> {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return {};
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return {};
  }
}

function normalize(raw: Partial<FinanceExtraction>, provider: string): FinanceExtraction {
  const num = (v: unknown) => {
    const n = typeof v === "string" ? parseFloat(v.replace(/[^0-9.\-]/g, "")) : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const date = typeof raw.invoice_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.invoice_date)
    ? raw.invoice_date : null;
  return {
    doc_type: raw.doc_type ?? null,
    vendor: raw.vendor ?? null,
    invoice_number: raw.invoice_number ?? null,
    invoice_date: date,
    currency: raw.currency ?? null,
    total_amount: num(raw.total_amount),
    tax_amount: num(raw.tax_amount),
    summary: raw.summary ?? null,
    line_items: Array.isArray(raw.line_items) ? raw.line_items.slice(0, 50) : [],
    confidence: num(raw.confidence),
    provider,
  };
}

async function foundryHeaders() {
  return { "api-key": API_KEY, Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
}

/** Foundry Agents threads API: create thread -> message -> run -> poll -> read. */
async function runFoundryAgent(prompt: string): Promise<FinanceExtraction> {
  const headers = await foundryHeaders();
  const qs = `?api-version=${API_VERSION}`;

  const threadRes = await fetch(`${PROJECT_ENDPOINT}/threads${qs}`, { method: "POST", headers, body: "{}" });
  if (!threadRes.ok) throw new Error(`Foundry thread ${threadRes.status}: ${(await threadRes.text()).slice(0, 300)}`);
  const threadId = (await threadRes.json()).id;

  const msgRes = await fetch(`${PROJECT_ENDPOINT}/threads/${threadId}/messages${qs}`, {
    method: "POST", headers,
    body: JSON.stringify({ role: "user", content: `${SYSTEM_PROMPT}\n\n---\n${prompt}` }),
  });
  if (!msgRes.ok) throw new Error(`Foundry message ${msgRes.status}`);

  const runRes = await fetch(`${PROJECT_ENDPOINT}/threads/${threadId}/runs${qs}`, {
    method: "POST", headers, body: JSON.stringify({ assistant_id: AGENT_ID }),
  });
  if (!runRes.ok) throw new Error(`Foundry run ${runRes.status}: ${(await runRes.text()).slice(0, 300)}`);
  let run = await runRes.json();

  for (let i = 0; i < 40 && ["queued", "in_progress", "requires_action"].includes(run.status); i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(`${PROJECT_ENDPOINT}/threads/${threadId}/runs/${run.id}${qs}`, { headers });
    run = await poll.json();
  }
  if (run.status !== "completed") throw new Error(`Foundry run status: ${run.status}`);

  const listRes = await fetch(`${PROJECT_ENDPOINT}/threads/${threadId}/messages${qs}&order=desc&limit=5`, { headers });
  const list = await listRes.json();
  const assistantMsg = (list.data ?? []).find((m: any) => m.role === "assistant");
  const text = (assistantMsg?.content ?? [])
    .map((c: any) => c?.text?.value ?? c?.text ?? "").join("\n");
  return normalize(parseJson(text), "foundry");
}

async function runGatewayFallback(prompt: string): Promise<FinanceExtraction> {
  if (!LOVABLE_API_KEY) throw new Error("No Foundry access and no LOVABLE_API_KEY fallback");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
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
  if (foundryConfigured()) {
    try {
      return await runFoundryAgent(prompt);
    } catch (e) {
      console.error("Foundry failed, falling back:", (e as Error).message);
    }
  }
  return await runGatewayFallback(prompt);
}
