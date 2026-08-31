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
  json_version: string | null;
  data_api_version: string | null;
  endpoint_uri: string | null;
  preview_url: string | null;
  metadata: Record<string, unknown>;
  last_synced_at: string | null;
};

export type WabaSubscribedAppRow = {
  id: string;
  waba_id: string;
  meta_app_id: string;
  app_name: string | null;
  app_link: string | null;
  app_namespace: string | null;
  app_category: string | null;
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

export type WabaInventoryExtra = {
  id: string;
  message_template_namespace: string | null;
  currency: string | null;
  timezone: string | null;
};

export type NumberInventoryExtra = {
  id: string;
  account_mode: string | null;
  platform_type: string | null;
  throughput_level: string | null;
  code_verification_status: string | null;
};

export function useWhatsappFlows() {
  return useQuery({
    queryKey: ["whatsapp_flows"],
    queryFn: async (): Promise<WhatsappFlowRow[]> => {
      const db = supabase as any;
      const { data, error } = await db
        .from("whatsapp_flows")
        .select(
          "id,organization_id,waba_id,meta_flow_id,name,status,categories,validation_errors,json_version,data_api_version,endpoint_uri,preview_url,metadata,last_synced_at",
        )
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
        .select(
          "id,waba_id,meta_app_id,app_name,app_link,app_namespace,app_category,override_callback_uri,is_azwa,status,last_synced_at",
        )
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

export function useWabaInventoryExtras() {
  return useQuery({
    queryKey: ["waba_inventory_extras"],
    queryFn: async (): Promise<Record<string, WabaInventoryExtra>> => {
      const db = supabase as any;
      const { data, error } = await db
        .from("wabas")
        .select("id,message_template_namespace,currency,timezone");
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((row: WabaInventoryExtra) => [row.id, row]));
    },
  });
}

export function useNumberInventoryExtras() {
  return useQuery({
    queryKey: ["whatsapp_number_inventory_extras"],
    queryFn: async (): Promise<Record<string, NumberInventoryExtra>> => {
      const db = supabase as any;
      const { data, error } = await db
        .from("whatsapp_numbers")
        .select("id,account_mode,platform_type,throughput_level,code_verification_status");
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((row: NumberInventoryExtra) => [row.id, row]));
    },
  });
}

export function useNumberAccountModes() {
  const query = useNumberInventoryExtras();
  return {
    ...query,
    data: Object.fromEntries(
      Object.entries(query.data ?? {}).map(([id, row]) => [id, row.account_mode ?? null]),
    ),
  };
}
