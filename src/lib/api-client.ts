/**
 * SouqChat API Client
 * ───────────────────
 * طبقة HTTP مباشرة تعمل بـ fetch الأصلية، مستقلة تماماً عن Supabase JS client.
 * تدعم المصادقة بـ JWT (session) أو API Key (sk_live_*).
 *
 * الاستخدام:
 *   import { createApiClient } from "@/lib/api-client";
 *   const api = createApiClient({ token: session.access_token });
 *   const result = await api.post("send_message", { tenant_id, conversation_id, text });
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthMode = "jwt" | "apikey";

export interface ApiClientConfig {
  /** JWT access token (من Supabase session) */
  token?: string;
  /** API Key بصيغة sk_live_* */
  apiKey?: string;
  /** عدد المحاولات عند الفشل — default: 2 */
  retries?: number;
  /** Timeout بالـ ms — default: 30000 */
  timeoutMs?: number;
}

export interface ApiResponse<T = unknown> {
  data: T | null;
  error: ApiError | null;
  status: number;
  ok: boolean;
}

export interface ApiError {
  message: string;
  code?: string | number;
  details?: unknown;
  status: number;
}

// ─── Edge Function names ──────────────────────────────────────────────────────

export type EdgeFunction =
  | "send_message"
  | "templates_sync"
  | "meta_sync_all"
  | "media_signed_url"
  | "media_delete"
  | "media_sync_wa"
  | "api_keys_manage"
  | "webhooks_manage"
  | "cloudinary_ops"
  | "diagnose_number"
  | "provision_tenant"
  | "seafile_upload"
  | "worker_dispatch";

// ─── Request body types ───────────────────────────────────────────────────────

export interface SendMessageBody {
  tenant_id: string;
  conversation_id: string;
  text?: string;
  template?: {
    name: string;
    language: { code: string };
    components?: { type: string; parameters: { type: string; text: string }[] }[];
  };
  media_url?: string;
  media_mime?: string;
  media_filename?: string;
  caption?: string;
}

export interface MetaSyncBody {
  tenant_id: string;
}

export interface TemplatesSyncBody {
  tenant_id: string;
  wa_account_id: string;
}

export interface MediaSignedUrlBody {
  tenant_id: string;
  media_id: string;
  action?: "view" | "download";
}

export interface MediaDeleteBody {
  tenant_id: string;
  media_id: string;
  mode?: "soft" | "hard";
}

export interface MediaSyncWaBody {
  tenant_id: string;
  wa_number_id?: string;
  limit?: number;
}

export interface ApiKeyBody {
  tenant_id: string;
  action: "create" | "list" | "disable" | "rotate" | "delete";
  name?: string;
  scopes?: string[];
  key_id?: string;
}

export interface WebhookBody {
  tenant_id: string;
  action: "create" | "list" | "update" | "delete" | "test" | "deliveries";
  url?: string;
  events?: string[];
  secret?: string;
  endpoint_id?: string;
  is_enabled?: boolean;
  limit?: number;
}

export interface DiagnoseNumberBody {
  tenant_id: string;
  phone_number_id: string;
}

// ─── API Error ────────────────────────────────────────────────────────────────

function buildError(status: number, body: unknown): ApiError {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const err: ApiError = {
      status,
      message: String(b["error"] || b["message"] || "خطأ غير معروف"),
      details: b["details"] ?? b,
    };
    if (b["code"] !== undefined && b["code"] !== null) err.code = String(b["code"]);
    return err;
  }
  return { status, message: `HTTP ${status}` };
}

// ─── Sleep helper for retry backoff ──────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Core client ─────────────────────────────────────────────────────────────

export class SouqChatApiClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly retries: number;
  private readonly timeoutMs: number;

  constructor(config: ApiClientConfig = {}) {
    const env = import.meta.env as Record<string, string | undefined>;
    const url = env["VITE_SUPABASE_URL"];
    if (!url) throw new Error("VITE_SUPABASE_URL is not set");

    this.baseUrl = `${url}/functions/v1`;
    this.retries = config.retries ?? 2;
    this.timeoutMs = config.timeoutMs ?? 30_000;

    // Auth header — API Key takes priority over JWT
    const authHeader = config.apiKey
      ? `Bearer ${config.apiKey}`
      : config.token
        ? `Bearer ${config.token}`
        : "";

    const anonKey = (env["VITE_SUPABASE_ANON_KEY"] || env["VITE_SUPABASE_PUBLISHABLE_KEY"]) ?? "";

    this.headers = {
      "Content-Type": "application/json",
      ...(anonKey ? { apikey: anonKey } : {}),
      ...(authHeader ? { Authorization: authHeader } : {}),
    };
  }

  // ── Low-level request ────────────────────────────────────────────────────

  async request<T = unknown>(
    fn: EdgeFunction | string,
    options: {
      method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      body?: unknown;
      signal?: AbortSignal;
    } = {},
  ): Promise<ApiResponse<T>> {
    const { method = "POST", body, signal } = options;
    const url = `${this.baseUrl}/${fn}`;

    let attempt = 0;

    while (attempt <= this.retries) {
      // Timeout controller
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const combinedSignal = signal ?? controller.signal;

      try {
        const fetchInit: RequestInit = {
          method,
          headers: this.headers,
          signal: combinedSignal,
        };
        if (body !== undefined) {
          fetchInit.body = JSON.stringify(body);
        }

        const res = await fetch(url, fetchInit);

        clearTimeout(timer);

        let parsed: unknown = null;
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          parsed = await res.json();
        } else {
          parsed = await res.text();
        }

        if (res.ok) {
          return { data: parsed as T, error: null, status: res.status, ok: true };
        }

        // Non-retryable status codes
        if (res.status < 500) {
          return {
            data: null,
            error: buildError(res.status, parsed),
            status: res.status,
            ok: false,
          };
        }

        // 5xx — retry
        attempt++;
        if (attempt <= this.retries) {
          await sleep(Math.pow(2, attempt - 1) * 500); // 500ms, 1000ms
          continue;
        }

        return { data: null, error: buildError(res.status, parsed), status: res.status, ok: false };
      } catch (err) {
        clearTimeout(timer);

        if ((err as Error).name === "AbortError") {
          return {
            data: null,
            error: { status: 0, message: "انتهى وقت الطلب أو تم إلغاؤه" },
            status: 0,
            ok: false,
          };
        }

        attempt++;
        if (attempt <= this.retries) {
          await sleep(Math.pow(2, attempt - 1) * 500);
          continue;
        }

        return {
          data: null,
          error: { status: 0, message: (err as Error).message || "Network error" },
          status: 0,
          ok: false,
        };
      }
    }

    return {
      data: null,
      error: { status: 0, message: "فشلت جميع المحاولات" },
      status: 0,
      ok: false,
    };
  }

  // ── Typed shortcuts ───────────────────────────────────────────────────────

  post<T = unknown>(fn: EdgeFunction | string, body: unknown, signal?: AbortSignal) {
    const opts: { method: "POST"; body: unknown; signal?: AbortSignal } = { method: "POST", body };
    if (signal) opts.signal = signal;
    return this.request<T>(fn, opts);
  }

  get<T = unknown>(fn: EdgeFunction | string, signal?: AbortSignal) {
    const opts: { method: "GET"; signal?: AbortSignal } = { method: "GET" };
    if (signal) opts.signal = signal;
    return this.request<T>(fn, opts);
  }

  // ── Domain methods ────────────────────────────────────────────────────────

  sendMessage(body: SendMessageBody, signal?: AbortSignal) {
    return this.post<{ success: boolean; message_id: string; provider_message_id: string }>(
      "send_message",
      body,
      signal,
    );
  }

  syncMeta(body: MetaSyncBody, signal?: AbortSignal) {
    return this.post<{
      success: boolean;
      wabas_synced: number;
      numbers_synced: number;
      templates_synced: number;
      errors: string[];
    }>("meta_sync_all", body, signal);
  }

  syncTemplates(body: TemplatesSyncBody, signal?: AbortSignal) {
    return this.post<{ success: boolean; synced: number }>("templates_sync", body, signal);
  }

  getSignedUrl(body: MediaSignedUrlBody, signal?: AbortSignal) {
    return this.post<{ url: string; expires_in: number; mime: string }>(
      "media_signed_url",
      body,
      signal,
    );
  }

  deleteMedia(body: MediaDeleteBody, signal?: AbortSignal) {
    return this.post<{ success: boolean; mode: "soft" | "hard" }>("media_delete", body, signal);
  }

  syncMediaFromWA(body: MediaSyncWaBody, signal?: AbortSignal) {
    return this.post<{
      synced: number;
      skipped: number;
      errors?: string[];
      message: string;
    }>("media_sync_wa", body, signal);
  }

  manageApiKey(body: ApiKeyBody, signal?: AbortSignal) {
    return this.post<unknown>("api_keys_manage", body, signal);
  }

  manageWebhook(body: WebhookBody, signal?: AbortSignal) {
    return this.post<unknown>("webhooks_manage", body, signal);
  }

  diagnoseNumber(body: DiagnoseNumberBody, signal?: AbortSignal) {
    return this.post<{
      success: boolean;
      data?: {
        display_phone_number: string;
        verified_name: string;
        quality_rating: string;
        status: string;
      };
      error?: string;
    }>("diagnose_number", body, signal);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createApiClient(config: ApiClientConfig = {}): SouqChatApiClient {
  return new SouqChatApiClient(config);
}
