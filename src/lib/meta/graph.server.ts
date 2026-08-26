/**
 * Meta Integration Layer — server only.
 * Central MetaGraphClient + credential resolver. No component or route may
 * call graph.facebook.com directly.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const GRAPH_VERSION = "v21.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type GraphResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  errorCode?: string;
  errorMessage?: string;
  durationMs: number;
};

type LogScope = { whatsappNumberId?: string | null; wabaId?: string | null };

/**
 * Resolves the most specific credential for a scope.
 * Precedence: phone -> waba -> business -> system user (env fallback).
 * The secret itself never leaves the server: meta_credentials stores only a
 * `secret_reference` (an environment variable name).
 */
export async function resolveCredential(scope: {
  whatsappNumberId?: string | null;
  wabaId?: string | null;
  businessPortfolioId?: string | null;
}): Promise<{ token: string | null; credentialId: string | null; source: string }> {
  const filters: Array<{ column: string; value: string; source: string }> = [];
  if (scope.whatsappNumberId)
    filters.push({ column: "whatsapp_number_id", value: scope.whatsappNumberId, source: "phone" });
  if (scope.wabaId) filters.push({ column: "waba_id", value: scope.wabaId, source: "waba" });
  if (scope.businessPortfolioId)
    filters.push({
      column: "business_portfolio_id",
      value: scope.businessPortfolioId,
      source: "business",
    });

  for (const f of filters) {
    const { data } = await supabaseAdmin
      .from("meta_credentials")
      .select("id, secret_reference, status, expires_at")
      .eq(f.column, f.value)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.secret_reference) {
      const token = process.env[data.secret_reference];
      if (token) return { token, credentialId: data.id, source: f.source };
    }
  }

  const fallback = process.env["META_SYSTEM_USER_TOKEN"];
  return { token: fallback ?? null, credentialId: null, source: fallback ? "system_user" : "none" };
}

async function logRequest(
  endpoint: string,
  method: string,
  status: number,
  durationMs: number,
  scope: LogScope,
  errorCode?: string,
  errorMessage?: string,
) {
  // Never log tokens.
  await supabaseAdmin.from("api_requests").insert({
    endpoint,
    method,
    http_status: status,
    duration_ms: durationMs,
    whatsapp_number_id: scope.whatsappNumberId ?? null,
    waba_id: scope.wabaId ?? null,
    meta_error_code: errorCode ?? null,
    meta_error_message: errorMessage ?? null,
  });
}

export class MetaGraphClient {
  constructor(
    private readonly token: string,
    private readonly scope: LogScope = {},
  ) {}

  async request<T>(
    path: string,
    init: { method?: string; body?: unknown; query?: Record<string, string> } = {},
  ): Promise<GraphResult<T>> {
    const method = init.method ?? "GET";
    const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

    const started = Date.now();
    let status = 0;
    let payload: Record<string, unknown> | null = null;
    try {
      const res = await fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: init.body ? JSON.stringify(init.body) : null,
      });
      status = res.status;
      payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    } catch (e) {
      const durationMs = Date.now() - started;
      const message = e instanceof Error ? e.message : "network error";
      await logRequest(path, method, 0, durationMs, this.scope, "network", message);
      return { ok: false, status: 0, data: null, errorMessage: message, durationMs };
    }

    const durationMs = Date.now() - started;
    const err = (payload?.["error"] ?? null) as { code?: number; message?: string } | null;
    await logRequest(
      path,
      method,
      status,
      durationMs,
      this.scope,
      err?.code != null ? String(err.code) : undefined,
      err?.message,
    );

    if (status >= 200 && status < 300 && !err) {
      return { ok: true, status, data: payload as T, durationMs };
    }
    return {
      ok: false,
      status,
      data: null,
      errorCode: err?.code != null ? String(err.code) : String(status),
      errorMessage: err?.message ?? `HTTP ${status}`,
      durationMs,
    };
  }
}

export async function clientForNumber(numberId: string) {
  const { data: number } = await supabaseAdmin
    .from("whatsapp_numbers")
    .select("id, waba_id, business_portfolio_id, meta_phone_number_id")
    .eq("id", numberId)
    .maybeSingle();
  if (!number) return { client: null as MetaGraphClient | null, number: null, source: "none" };
  const cred = await resolveCredential({
    whatsappNumberId: number.id,
    wabaId: number.waba_id,
    businessPortfolioId: number.business_portfolio_id,
  });
  return {
    client: cred.token
      ? new MetaGraphClient(cred.token, { whatsappNumberId: number.id, wabaId: number.waba_id })
      : null,
    number,
    source: cred.source,
  };
}
