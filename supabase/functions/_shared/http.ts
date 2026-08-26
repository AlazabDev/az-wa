export const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" } as const;

export function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...Object.fromEntries(new Headers(extraHeaders).entries()) },
  });
}

export function text(body: string, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(body, { status, headers: extraHeaders });
}

export function methodNotAllowed(allowed: string[]): Response {
  return json({ error: "method_not_allowed" }, 405, { Allow: allowed.join(", ") });
}

export async function parseJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "expected application/json");
  }
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "invalid JSON body");
  }
}

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = "request_error", details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: error.code, message: error.message, details: error.details ?? null }, error.status);
  }
  console.error("unhandled error", error);
  return json({ error: "internal_error", message: "Internal server error" }, 500);
}

export function bearerToken(req: Request): string | null {
  const value = req.headers.get("authorization");
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function requestId(req: Request): string {
  return req.headers.get("x-request-id") || crypto.randomUUID();
}
