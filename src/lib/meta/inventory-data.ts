/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WhatsappFlowRow = {
  id: string;
  organization_id: string;
  waba_id: string;
  meta_flow_id: string;
  name: string;
  status: string;
  categories: string[];
  validation_errors: unknown[];
  last_synced_at: string | null;
};

export type WabaSubscribedAppRow = {
  id: string;
  waba_id: string;
  meta_app_id: string;
  app_name: string | null;
  app_namespace: string | null;
  override_callback_uri: string | null;
  is_azwa: boolean;
  status: string;
  last_synced_at: string | null;
};

export type WabaAssignedUserRow = {
  id: string;
  waba_id: string;
  meta_user_id: string;
  name: string | null;
  tasks: string[];
  status: string;
  last_synced_at: string | null;
};

export function useWhatsappFlows() {
  return useQuery({
    queryKey: ["whatsapp_flows"],
    queryFn: async (): Promise<WhatsappFlowRow[]> => {
      const db = supabase as any;
      const { data, error } = await db
        .from("whatsapp_flows")
        .select("id,organization_id,waba_id,meta_flow_id,name,status,categories,validation_errors,last_synced_at")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWabaSubscribedApps() {
  return useQuery({
    queryKey: ["waba_subscribed_apps"],
    queryFn: async (): Promise<WabaSubscribedAppRow[]> => {
      const db = supabase as any;
      const { data, error } = await db
        .from("waba_subscribed_apps")
        .select("id,waba_id,meta_app_id,app_name,app_namespace,override_callback_uri,is_azwa,status,last_synced_at")
        .order("app_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWabaAssignedUsers() {
  return useQuery({
    queryKey: ["waba_assigned_users"],
    queryFn: async (): Promise<WabaAssignedUserRow[]> => {
      const db = supabase as any;
      const { data, error } = await db
        .from("waba_assigned_users")
        .select("id,waba_id,meta_user_id,name,tasks,status,last_synced_at")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useNumberAccountModes() {
  return useQuery({
    queryKey: ["whatsapp_number_account_modes"],
    queryFn: async (): Promise<Record<string, string | null>> => {
      const db = supabase as any;
      const { data, error } = await db
        .from("whatsapp_numbers")
        .select("id,account_mode");
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((row: any) => [row.id, row.account_mode ?? null]));
    },
  });
}
