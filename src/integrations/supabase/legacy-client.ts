import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";

// Untyped alias of the shared client for the legacy pages (src/pages/*).
// Those pages query tenant-scoped tables that are not part of the generated
// Database types, so they use this loosely-typed handle instead.
export const legacySupabase = supabase as unknown as SupabaseClient;
