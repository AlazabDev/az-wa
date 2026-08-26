import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError, bearerToken } from "./http.ts";

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function projectUrl(): string {
  return required("SUPABASE_URL").replace(/\/$/, "");
}

export function serviceKey(): string {
  return required("SUPABASE_SERVICE_ROLE_KEY");
}

export function publicKey(): string {
  return Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || required("SUPABASE_ANON_KEY");
}

export function serviceClient(): SupabaseClient {
  return createClient(projectUrl(), serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "azwa-backend/service" } },
  });
}

export function userClient(req: Request): SupabaseClient {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, "Missing bearer token", "unauthorized");
  return createClient(projectUrl(), publicKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Client-Info": "azwa-backend/user",
      },
    },
  });
}

export async function requireUser(req: Request): Promise<{ id: string; email: string | null }> {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, "Missing bearer token", "unauthorized");
  const svc = serviceClient();
  const { data, error } = await svc.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Invalid or expired session", "unauthorized");
  return { id: data.user.id, email: data.user.email ?? null };
}
