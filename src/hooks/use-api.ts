/**
 * useApi — React Hook للاتصال المباشر بـ Edge Functions
 * ──────────────────────────────────────────────────────
 * يعمل بـ fetch الأصلية، بدون Supabase JS client.
 * يأخذ JWT من الـ session تلقائياً أو API Key يدوياً.
 *
 * مثال — Query (جلب بيانات):
 *   const { data, loading, error, refetch } = useApiQuery(
 *     (api) => api.manageApiKey({ tenant_id, action: "list" }),
 *     [tenant_id]
 *   );
 *
 * مثال — Mutation (تنفيذ عملية):
 *   const { mutate, loading, error } = useApiMutation(
 *     (api, body: SendMessageBody) => api.sendMessage(body)
 *   );
 *   await mutate({ tenant_id, conversation_id, text: "مرحباً" });
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  SouqChatApiClient,
  type ApiClientConfig,
  type ApiResponse,
  type ApiError,
} from "@/lib/api-client";

// ─── Hook state types ─────────────────────────────────────────────────────────

export interface UseApiQueryState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  refetch: () => void;
}

export interface UseApiMutationState<T, B> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  mutate: (body: B) => Promise<ApiResponse<T>>;
  reset: () => void;
}

// ─── Internal: build client from current session ──────────────────────────────

function useApiClient(overrideConfig?: Omit<ApiClientConfig, "token">): SouqChatApiClient {
  const { session } = useAuth();

  return useMemo(
    () => {
      const cfg: ApiClientConfig = { ...overrideConfig };
      if (session?.access_token) cfg.token = session.access_token;
      return new SouqChatApiClient(cfg);
    },
    // Rebuild client when session token changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.access_token, overrideConfig?.apiKey],
  );
}

// ─── useApiQuery ──────────────────────────────────────────────────────────────
/**
 * للقراءة والجلب — يُشغَّل تلقائياً عند التحميل، ويدعم إعادة الجلب.
 *
 * @param queryFn   دالة تأخذ ApiClient وتُعيد Promise<ApiResponse<T>>
 * @param deps      مصفوفة تبعيات — يُعاد الجلب عند تغيّرها (مثل [tenantId])
 * @param config    تهيئة اختيارية للـ client (apiKey, retries, ...)
 * @param enabled   تعطيل الجلب التلقائي — default: true
 */
export function useApiQuery<T>(
  queryFn: (client: SouqChatApiClient, signal: AbortSignal) => Promise<ApiResponse<T>>,
  deps: unknown[] = [],
  options: {
    config?: Omit<ApiClientConfig, "token">;
    enabled?: boolean;
  } = {},
): UseApiQueryState<T> {
  const { config, enabled = true } = options;
  const client = useApiClient(config);

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  // Stable refetch trigger
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    queryFn(client, controller.signal).then((res) => {
      if (controller.signal.aborted) return;
      if (res.ok) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
      setLoading(false);
    });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tick, ...deps]);

  return { data, error, loading, refetch };
}

// ─── useApiMutation ───────────────────────────────────────────────────────────
/**
 * للكتابة والتعديل — لا يُشغَّل تلقائياً.
 * استدعِ `mutate(body)` عند الحاجة.
 *
 * @param mutationFn   دالة تأخذ (client, body) وتُعيد Promise<ApiResponse<T>>
 * @param config       تهيئة اختيارية
 */
export function useApiMutation<T, B = unknown>(
  mutationFn: (client: SouqChatApiClient, body: B, signal: AbortSignal) => Promise<ApiResponse<T>>,
  options: {
    config?: Omit<ApiClientConfig, "token">;
    onSuccess?: (data: T) => void;
    onError?: (error: ApiError) => void;
  } = {},
): UseApiMutationState<T, B> {
  const { config, onSuccess, onError } = options;
  const client = useApiClient(config);

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  // Keep latest callbacks without triggering re-render
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  const controllerRef = useRef<AbortController | null>(null);

  const mutate = useCallback(
    async (body: B): Promise<ApiResponse<T>> => {
      // Cancel previous in-flight request
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setLoading(true);
      setError(null);

      const res = await mutationFn(client, body, controller.signal);

      if (!controller.signal.aborted) {
        if (res.ok && res.data !== null) {
          setData(res.data);
          setError(null);
          onSuccessRef.current?.(res.data);
        } else if (res.error) {
          setError(res.error);
          onErrorRef.current?.(res.error);
        }
        setLoading(false);
      }

      return res;
    },
    [client, mutationFn],
  );

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  // Cleanup on unmount
  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  return { data, error, loading, mutate, reset };
}

// ─── useDirectApi — الاستخدام الأبسط ─────────────────────────────────────────
/**
 * Convenience hook — يُعيد client مباشرة لمن يريد استدعاء يدوي بدون state.
 *
 * @example
 *   const api = useDirectApi();
 *   const onClick = async () => {
 *     const { data, error } = await api.sendMessage({ ... });
 *   };
 */
export function useDirectApi(config?: Omit<ApiClientConfig, "token">): SouqChatApiClient {
  return useApiClient(config);
}
