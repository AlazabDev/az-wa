const DEFAULT_ORIGINS = ["https://wa.alazab.com", "https://alazab.com"];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const configured = (Deno.env.get("AZWA_ALLOWED_ORIGINS") || DEFAULT_ORIGINS.join(","))
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && configured.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
