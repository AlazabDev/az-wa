import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { MetaCredential, MetaScope } from "./types.ts";

export class MetaApiError extends Error {
  httpStatus: number;
  metaCode?: string;
  metaSubcode?: string;
  metaType?: string;
  metaTraceId?: string;
  payload: unknown;

  constructor(message: string, httpStatus: number, payload: unknown) {
    super(message);
    this.httpStatus = httpStatus;
    this.payload = payload;
    const err = (payload as any)?.error;
    this.metaCode = err?.code != null ? String(err.code) : undefined;
    this.metaSubcode = err?.error_subcode != null ? String(err.error_subcode) : undefined;
    this.metaType = err?.type;
    this.metaTraceId = err?.fbtrace_id;
  }
}

export async function graphVersion(client: SupabaseClient, organizationId: string): Promise<string> {
  const env = Deno.env.get("META_GRAPH_VERSION")?.trim();
  if (env) return normalizeVersion(env);
  const { data } = await client
    .from("system_settings")
    .select("value")
    .eq("organization_id", organizationId)
    .eq("key", "meta.graph_version")
    .maybeSingle();
  const configured = (data?.value as any)?.value;
  return normalizeVersion(typeof configured === "string" ? configured : "v26.0");
}

function normalizeVersion(value: string): string {
  const v = value.trim();
  return /^v\d+\.\d+$/.test(v) ? v : "v26.0";
}

export async function resolveMetaToken(client: SupabaseClient, scope: Partial<MetaScope>): Promise<MetaCredential> {
  const { data, error } = await client.rpc("backend_resolve_meta_token", {
    p_whatsapp_number_id: scope.whatsappNumberId ?? null,
    p_waba_id: scope.wabaId ?? null,
    p_business_portfolio_id: scope.businessPortfolioId ?? null,
  });
  if (error) throw new Error(`Credential resolution failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.token) throw new Error("No active Meta access token found for this scope");
  return row as MetaCredential;
}

export interface MetaFetchOptions {
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  correlationId?: string;
  token?: string;
  version?: string;
  log?: boolean;
}

export async function metaFetch<T = any>(
  client: SupabaseClient,
  scope: MetaScope,
  pathOrUrl: string,
  options: MetaFetchOptions = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const credential = options.token ? null : await resolveMetaToken(client, scope);
  const token = options.token ?? credential!.token;
  const version = options.version ?? await graphVersion(client, scope.organizationId);
  const url = buildGraphUrl(pathOrUrl, version, options.query);
  const started = performance.now();
  let response: Response | null = null;
  let parsed: any = null;
  let apiRequestId: string | null = null;

  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const contentType = response.headers.get("content-type") ?? "";
    parsed = contentType.includes("application/json") ? await response.json() : await response.text();

    if (options.log !== false) {
      apiRequestId = await logApiRequest(client, scope, {
        correlationId: options.correlationId,
        endpoint: safeEndpoint(url),
        method,
        httpStatus: response.status,
        durationMs: Math.round(performance.now() - started),
        error: response.ok ? null : parsed,
        responseHeaders: response.headers,
      });
    }

    if (!response.ok) {
      await logApiError(client, scope, apiRequestId, parsed);
      throw new MetaApiError(metaErrorMessage(parsed, response.status), response.status, parsed);
    }
    return parsed as T;
  } catch (error) {
    if (error instanceof MetaApiError) throw error;
    if (options.log !== false && response === null) {
      apiRequestId = await logApiRequest(client, scope, {
        correlationId: options.correlationId,
        endpoint: safeEndpoint(url),
        method,
        httpStatus: null,
        durationMs: Math.round(performance.now() - started),
        error: { message: error instanceof Error ? error.message : String(error) },
        responseHeaders: null,
      });
      await logApiError(client, scope, apiRequestId, { error: { message: error instanceof Error ? error.message : String(error), type: "network_error" } });
    }
    throw error;
  }
}

export async function metaGetAll<T = any>(
  client: SupabaseClient,
  scope: MetaScope,
  path: string,
  query: Record<string, string | number | boolean | null | undefined> = {},
  maxPages = 100,
): Promise<T[]> {
  const results: T[] = [];
  let next: string | null = path;
  let page = 0;
  let first = true;
  while (next && page < maxPages) {
    const response: any = await metaFetch(client, scope, next, { query: first ? query : undefined });
    if (Array.isArray(response?.data)) results.push(...response.data);
    next = typeof response?.paging?.next === "string" ? response.paging.next : null;
    first = false;
    page += 1;
  }
  if (page >= maxPages && next) throw new Error(`Meta pagination exceeded ${maxPages} pages`);
  return results;
}

function buildGraphUrl(pathOrUrl: string, version: string, query?: MetaFetchOptions["query"]): URL {
  let url: URL;
  if (/^https:\/\//i.test(pathOrUrl)) {
    url = new URL(pathOrUrl);
  } else {
    const path = pathOrUrl.replace(/^\/+/, "");
    url = new URL(`https://graph.facebook.com/${version}/${path}`);
  }
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function safeEndpoint(url: URL): string {
  const safe = new URL(url.toString());
  for (const key of ["access_token", "appsecret_proof", "client_secret"]) safe.searchParams.delete(key);
  return safe.pathname + (safe.search ? safe.search : "");
}

async function logApiRequest(
  client: SupabaseClient,
  scope: MetaScope,
  data: {
    correlationId?: string;
    endpoint: string;
    method: string;
    httpStatus: number | null;
    durationMs: number;
    error: any;
    responseHeaders: Headers | null;
  },
): Promise<string | null> {
  const err = data.error?.error;
  const responseMeta = data.responseHeaders
    ? {
        fb_trace_id: data.responseHeaders.get("x-fb-trace-id"),
        fb_rev: data.responseHeaders.get("x-fb-rev"),
        business_use_case_usage: data.responseHeaders.get("x-business-use-case-usage"),
      }
    : {};

  const { data: row, error } = await client
    .from("api_requests")
    .insert({
      organization_id: scope.organizationId,
      correlation_id: data.correlationId ?? null,
      meta_app_id: scope.metaAppId ?? null,
      business_portfolio_id: scope.businessPortfolioId ?? null,
      waba_id: scope.wabaId ?? null,
      whatsapp_number_id: scope.whatsappNumberId ?? null,
      endpoint: data.endpoint,
      method: data.method,
      http_status: data.httpStatus,
      duration_ms: data.durationMs,
      meta_error_code: err?.code != null ? String(err.code) : null,
      meta_error_message: err?.message ?? null,
      request_meta: {},
      response_meta: responseMeta,
    })
    .select("id")
    .single();
  if (error) {
    console.error("failed to persist api_requests", { code: error.code, message: error.message });
    return null;
  }
  return row.id as string;
}

async function logApiError(client: SupabaseClient, scope: MetaScope, apiRequestId: string | null, payload: any): Promise<void> {
  const err = payload?.error ?? payload ?? {};
  const title = err.type || "Meta Graph API Error";
  const message = err.message || "Meta API request failed";
  const code = err.code != null ? String(err.code) : null;
  const { error } = await client.from("api_errors").insert({
    organization_id: scope.organizationId,
    api_request_id: apiRequestId,
    whatsapp_number_id: scope.whatsappNumberId ?? null,
    waba_id: scope.wabaId ?? null,
    error_type: err.type ?? "meta_api",
    error_code: code,
    title,
    message,
    raw_error: payload ?? {},
    status: "open",
  });
  if (error) console.error("failed to persist api_errors", { code: error.code, message: error.message });
}

function metaErrorMessage(payload: any, status: number): string {
  return payload?.error?.message || `Meta Graph API request failed (${status})`;
}
