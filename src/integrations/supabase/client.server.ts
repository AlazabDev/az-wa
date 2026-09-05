// Server-only Supabase clients with service-role access.
// These clients bypass RLS and must never be imported into browser code.
import { createClient } from "@supabase/supabase-js";

import type { Database } from "./types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function requiredServerEnv() {
  const SUPABASE_URL = process.env["SUPABASE_URL"]?.trim();
  const SUPABASE_SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();

  const missing = [
    ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
    ...(!SUPABASE_SERVICE_ROLE_KEY ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];

  if (missing.length > 0) {
    throw new Error(`Missing required server Supabase configuration: ${missing.join(", ")}`);
  }

  return { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY };
}

function clientOptions(serviceRoleKey: string) {
  return {
    global: {
      fetch: createSupabaseFetch(serviceRoleKey),
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  };
}

function createSupabaseAdminClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = requiredServerEnv();
  return createClient<Database>(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    clientOptions(SUPABASE_SERVICE_ROLE_KEY),
  );
}

// Some backend runtime tables are installed by migrations after the checked-in
// generated Database type. This client deliberately uses PostgREST's runtime
// schema so those tables can be updated without weakening the typed client used
// everywhere else.
function createSupabaseRuntimeAdminClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = requiredServerEnv();
  return createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    clientOptions(SUPABASE_SERVICE_ROLE_KEY),
  );
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;
let _supabaseRuntimeAdmin: ReturnType<typeof createSupabaseRuntimeAdminClient> | undefined;

// Server-side Supabase client with service role - bypasses RLS.
// SECURITY: only use this for trusted server operations; never expose it to client code.
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});

// Runtime-schema variant for operational tables newer than the generated type.
export const supabaseRuntimeAdmin = new Proxy(
  {} as ReturnType<typeof createSupabaseRuntimeAdminClient>,
  {
    get(_, prop, receiver) {
      if (!_supabaseRuntimeAdmin) _supabaseRuntimeAdmin = createSupabaseRuntimeAdminClient();
      return Reflect.get(_supabaseRuntimeAdmin, prop, receiver);
    },
  },
);
