import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/meta/whatsapp")({
  server: {
    handlers: {
      GET: ({ request }) => proxyToEdgeWebhook(request),
      POST: ({ request }) => proxyToEdgeWebhook(request),
    },
  },
});

async function proxyToEdgeWebhook(request: Request): Promise<Response> {
  const supabaseUrl = process.env["SUPABASE_URL"]?.replace(/\/$/, "");
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!supabaseUrl || !publishableKey) {
    console.error("[AzWA webhook proxy] Missing Supabase server configuration");
    return new Response("Service Unavailable", { status: 503 });
  }

  const incoming = new URL(request.url);
  const target = new URL(`${supabaseUrl}/functions/v1/azwa-webhook`);
  target.search = incoming.search;

  const headers = new Headers();
  headers.set("apikey", publishableKey);
  const signature = request.headers.get("x-hub-signature-256");
  const contentType = request.headers.get("content-type");
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  if (signature) headers.set("x-hub-signature-256", signature);
  if (contentType) headers.set("content-type", contentType);
  headers.set("x-request-id", requestId);

  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "POST" ? await request.arrayBuffer() : undefined,
  });

  const responseHeaders = new Headers();
  const responseContentType = response.headers.get("content-type");
  if (responseContentType) responseHeaders.set("content-type", responseContentType);
  responseHeaders.set("x-request-id", requestId);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
