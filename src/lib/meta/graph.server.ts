/**
 * Meta Integration Layer — server only.
 * Central MetaGraphClient + credential resolver. No component or route may
 * call graph.facebook.com directly.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { META_INVENTORY_BASELINE } from "./inventory-baseline";

const configuredGraphVersion = (process.env["META_GRAPH_VERSION"] ?? "v26.0").trim();
export const GRAPH_VERSION = /^v\d+\.\d+$/.test(configuredGraphVersion)
  ? configuredGraphVersion
  : "v26.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type GraphResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  errorCode?: string;
  errorMessage?: string;
  durationMs: number;
};

type LogScope = {
  organizationId?: string | null;
  whatsappNumberId?: string | null;
  wabaId?: string | null;
  businessPortfolioId?: string | null;
};

/** The default organization for backend operations (single-tenant install). */
export async function defaultOrganizationId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Resolves the most specific credential for a scope through the database
 * (`backend_resolve_meta_token`), which decrypts the secret from Vault.
 * Precedence: phone -> waba -> business. Falls back to a server env token.
 */
export async function resolveCredential(scope: {
  whatsappNumberId?: string | null;
  wabaId?: string | null;
  businessPortfolioId?: string | null;
}): Promise<{ token: string | null; credentialId: string | null; source: string }> {
  const { data } = await supabaseAdmin.rpc("backend_resolve_meta_token", {
    p_whatsapp_number_id: scope.whatsappNumberId ?? (null as unknown as string),
    p_waba_id: scope.wabaId ?? (null as unknown as string),
    p_business_portfolio_id: scope.businessPortfolioId ?? (null as unknown as string),
  });

  const row = Array.isArray(data) ? data[0] : null;
  if (row?.token) {
    return { token: row.token, credentialId: row.credential_id, source: row.credential_type };
  }

  const fallback = process.env["META_SYSTEM_USER_TOKEN"];
  return { token: fallback ?? null, credentialId: null, source: fallback ? "env" : "none" };
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
  const organizationId = scope.organizationId ?? (await defaultOrganizationId());
  if (!organizationId) return;
  await supabaseAdmin.from("api_requests").insert({
    organization_id: organizationId,
    endpoint,
    method,
    http_status: status,
    duration_ms: durationMs,
    whatsapp_number_id: scope.whatsappNumberId ?? null,
    waba_id: scope.wabaId ?? null,
    business_portfolio_id: scope.businessPortfolioId ?? null,
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

  /**
   * Multipart Graph request used by endpoints that explicitly require form-data
   * (currently WhatsApp Flow asset uploads). The browser never receives the token.
   * Do not set Content-Type manually: fetch must add the multipart boundary.
   */
  async requestFormData<T>(
    path: string,
    formData: FormData,
    init: { method?: string; query?: Record<string, string> } = {},
  ): Promise<GraphResult<T>> {
    const method = init.method ?? "POST";
    const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

    const started = Date.now();
    let status = 0;
    let payload: Record<string, unknown> | null = null;
    try {
      const res = await fetch(url.toString(), {
        method,
        headers: { Authorization: `Bearer ${this.token}` },
        body: formData,
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

export type NumberScope = {
  id: string;
  organization_id: string;
  waba_id: string;
  meta_phone_number_id: string;
  business_portfolio_id: string | null;
};

export async function loadNumberScope(numberId: string): Promise<NumberScope | null> {
  const cleanId = numberId.replace(/^num-/, "");
  const { data } = await supabaseAdmin
    .from("whatsapp_numbers")
    .select("id, organization_id, waba_id, meta_phone_number_id, wabas(business_portfolio_id)")
    .or(`id.eq.${numberId},meta_phone_number_id.eq.${cleanId}`)
    .maybeSingle();

  if (data) {
    return {
      id: data.id,
      organization_id: data.organization_id,
      waba_id: data.waba_id,
      meta_phone_number_id: data.meta_phone_number_id,
      business_portfolio_id: data.wabas?.business_portfolio_id ?? null,
    };
  }

  // Baseline fallback lookup for the 9 audited numbers
  const baselinePhone = META_INVENTORY_BASELINE.phones.find(
    (p) => p.metaPhoneId === cleanId || `num-${p.metaPhoneId}` === numberId,
  );
  if (baselinePhone) {
    const WABA_MAP: Record<string, string> = {
      "1328521857002632": "922964860845619",
      "1011864912017679": "2154838801923462",
      "1197837903405393": "1527103499063250",
      "1061490140383829": "1303965001665007",
      "1020054711186921": "2144651456337012",
      "1032441389943808": "1458856398934130",
      "952530191273396": "1458856398934130",
      "644995285354639": "459851797218855",
      "527697617099639": "459851797218855",
    };
    const metaWabaId = WABA_MAP[baselinePhone.metaPhoneId] ?? "459851797218855";
    return {
      id: numberId,
      organization_id: "org-alazab-group",
      waba_id: `waba-${metaWabaId}`,
      meta_phone_number_id: baselinePhone.metaPhoneId,
      business_portfolio_id: "bp-31443701205",
    };
  }

  return null;
}

export async function clientForNumber(numberId: string) {
  const number = await loadNumberScope(numberId);
  if (!number) return { client: null as MetaGraphClient | null, number: null, source: "none" };
  const cred = await resolveCredential({
    whatsappNumberId: number.id,
    wabaId: number.waba_id,
    businessPortfolioId: number.business_portfolio_id,
  });
  return {
    client: cred.token
      ? new MetaGraphClient(cred.token, {
          organizationId: number.organization_id,
          whatsappNumberId: number.id,
          wabaId: number.waba_id,
          businessPortfolioId: number.business_portfolio_id,
        })
      : null,
    number,
    source: cred.source,
  };
}
