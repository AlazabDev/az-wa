import { createClient } from "@supabase/supabase-js";

import type { Database } from "./types";
import { productionAuthStorage } from "./previewAuthStorage";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim();
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "Missing production Supabase configuration: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY",
  );
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: productionAuthStorage(),
    storageKey: "azwa-auth",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
