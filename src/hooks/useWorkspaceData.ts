import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";

export function useWorkspaceData<T extends "contacts" | "conversations" | "messages" | "media_files" | "whatsapp_accounts">(table: T) {
  const { user } = useAuth();
  return useQuery({ queryKey: [table, user?.id], enabled: !!user, queryFn: async () => {
    if (!user) return [] as Tables<T>[];
    const query = (() => {
      switch (table) {
        case "contacts": return supabase.from("contacts").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
        case "conversations": return supabase.from("conversations").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
        case "messages": return supabase.from("messages").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
        case "media_files": return supabase.from("media_files").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
        case "whatsapp_accounts": return supabase.from("whatsapp_accounts").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      }
    })();
    if (!query) return [] as Tables<T>[];
    const { data, error } = await query;
    if (error) throw error;
    return data as unknown as Tables<T>[];
  }});
}