import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SyncDiagnosisResult = { ok: true; analysis: string } | { ok: false; error: string };

const INSTRUCTIONS = `You are a senior Meta WhatsApp Business Platform (Cloud API) support engineer for the AzWA control center.
Analyze the admin's Meta error logs or sync problem description together with the provided WABA / phone number context and recent recorded errors.
Reply in the same language the admin used (Arabic if they wrote Arabic). Use Markdown with these sections:
1. **التشخيص / Diagnosis** — the most likely root cause, citing Meta error codes (e.g. 190, 100, 131030, 131047, 133010, 200, 10) when present.
2. **خطوات الإصلاح / Fix steps** — numbered, concrete, specific to the given WABA ID and phone number ID (Meta Business Manager / WhatsApp Manager paths, Graph API calls like POST /{waba-id}/subscribed_apps, POST /{phone-number-id}/register, token scopes whatsapp_business_management & whatsapp_business_messaging). Mention AzWA pages where useful: Meta App, Live Monitor ("Link all numbers to webhook", "Sync live with Meta"), Phone Numbers ("Sync Meta"), Credentials.
3. **التحقق / Verify** — how to confirm the fix worked.
Never ask for or reveal secrets. If information is missing, say what to collect.`;

export const analyzeMetaSyncIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { numberId: string | null; log: string }) => {
    const log = String(input.log ?? "").trim();
    if (log.length < 5) throw new Error("Please paste an error log or describe the problem.");
    return { numberId: input.numberId || null, log: log.slice(0, 20_000) };
  })
  .handler(async ({ data, context }): Promise<SyncDiagnosisResult> => {
    const { data: membership } = await context.supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership) return { ok: false, error: "No active organization membership" };
    const orgId = membership.organization_id;

    const { data: allowed } = await context.supabase.rpc("azwa_has_org_permission", {
      p_org_id: orgId,
      p_permission: "numbers.manage",
    });
    if (!allowed) return { ok: false, error: "Forbidden: admin permission required" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let contextBlock = "No specific number selected.";
    let recentErrors: unknown[] = [];

    if (data.numberId) {
      const { data: number } = await supabaseAdmin
        .from("whatsapp_numbers")
        .select("*")
        .eq("id", data.numberId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (!number) return { ok: false, error: "Number not found in your organization" };
      const n = number as Record<string, unknown>;
      const { data: waba } = n["waba_id"]
        ? await supabaseAdmin
            .from("wabas")
            .select("meta_waba_id, name, status, account_review_status, business_verification_status, last_synced_at")
            .eq("id", String(n["waba_id"]))
            .maybeSingle()
        : { data: null };
      const pick = (k: string) => n[k] ?? null;
      contextBlock = JSON.stringify(
        {
          number: {
            display_phone_number: pick("display_phone_number"),
            meta_phone_number_id: pick("meta_phone_number_id"),
            verified_name: pick("verified_name"),
            status: pick("status"),
            enabled: pick("enabled"),
            health: pick("health"),
            api_health: pick("api_health"),
            webhook_status: pick("webhook_status"),
            quality_rating: pick("quality_rating"),
            last_incoming_at: pick("last_incoming_at"),
          },
          waba,
        },
        null,
        2,
      );
      const { data: errs } = await supabaseAdmin
        .from("api_errors")
        .select("created_at, error_code, error_type, title, message, occurrence_count")
        .eq("organization_id", orgId)
        .eq("whatsapp_number_id", data.numberId)
        .order("created_at", { ascending: false })
        .limit(10);
      recentErrors = errs ?? [];
    }

    const input = `## Affected WABA / number context\n${contextBlock}\n\n## Recent recorded API errors\n${JSON.stringify(recentErrors, null, 2)}\n\n## Admin input (logs / description)\n${data.log}`;

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { ok: false, error: "AI is not configured (missing LOVABLE_API_KEY)." };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions: INSTRUCTIONS,
        input: [{ role: "user", content: input }],
        reasoning: { effort: "medium" },
        store: false,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      let msg = `AI request failed (${res.status})`;
      try {
        const j = (await res.json()) as { error?: { message?: string }; message?: string };
        msg = j.error?.message ?? j.message ?? msg;
      } catch {
        /* ignore */
      }
      if (res.status === 429) msg = "Rate limited — please try again shortly.";
      if (res.status === 402) msg = `AI credits exhausted: ${msg}`;
      return { ok: false, error: msg };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let failure: string | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const ev = JSON.parse(payload) as {
              type?: string;
              delta?: string;
              response?: { error?: { message?: string } };
              message?: string;
            };
            if (ev.type === "response.output_text.delta" && ev.delta) text += ev.delta;
            if (ev.type === "response.failed" || ev.type === "error")
              failure = ev.response?.error?.message ?? ev.message ?? "AI response failed";
          } catch {
            /* partial */
          }
        }
      }
    }
    if (failure) return { ok: false, error: failure };
    if (!text.trim()) return { ok: false, error: "The model returned no answer." };
    return { ok: true, analysis: text.trim() };
  });

