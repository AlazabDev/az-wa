import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { readRecordTable } from "@/lib/record-table.functions";

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

function useInventoryReader() {
  return useServerFn(readRecordTable);
}

export function useWhatsappFlows() {
  const readRecords = useInventoryReader();
  return useQuery({
    queryKey: ["whatsapp_flows"],
    queryFn: async (): Promise<WhatsappFlowRow[]> => {
      const rows = await readRecords({
        data: { table: "whatsapp_flows", orderBy: "name", limit: 500 },
      });
      return rows as unknown as WhatsappFlowRow[];
    },
    refetchInterval: 30_000,
  });
}

export function useWabaSubscribedApps() {
  const readRecords = useInventoryReader();
  return useQuery({
    queryKey: ["waba_subscribed_apps"],
    queryFn: async (): Promise<WabaSubscribedAppRow[]> => {
      const rows = await readRecords({
        data: { table: "waba_subscribed_apps", orderBy: "app_name", limit: 500 },
      });
      return rows as unknown as WabaSubscribedAppRow[];
    },
    refetchInterval: 30_000,
  });
}

export function useWabaAssignedUsers() {
  const readRecords = useInventoryReader();
  return useQuery({
    queryKey: ["waba_assigned_users"],
    queryFn: async (): Promise<WabaAssignedUserRow[]> => {
      const rows = await readRecords({
        data: { table: "waba_assigned_users", orderBy: "name", limit: 500 },
      });
      return rows as unknown as WabaAssignedUserRow[];
    },
    refetchInterval: 30_000,
  });
}

export function useWabaInventoryExtras() {
  const readRecords = useInventoryReader();
  return useQuery({
    queryKey: ["waba_inventory_extras"],
    queryFn: async (): Promise<Record<string, WabaInventoryExtra>> => {
      const rows = (await readRecords({
        data: { table: "wabas", orderBy: "created_at", limit: 500 },
      })) as unknown as Array<WabaInventoryExtra & Record<string, unknown>>;

      return Object.fromEntries(
        rows.map((row) => [
          row.id,
          {
            id: row.id,
            message_template_namespace: row.message_template_namespace ?? null,
            currency: row.currency ?? null,
            timezone: row.timezone ?? null,
          },
        ]),
      );
    },
    refetchInterval: 30_000,
  });
}

export function useNumberInventoryExtras() {
  const readRecords = useInventoryReader();
  return useQuery({
    queryKey: ["whatsapp_number_inventory_extras"],
    queryFn: async (): Promise<Record<string, NumberInventoryExtra>> => {
      const rows = (await readRecords({
        data: { table: "whatsapp_numbers", orderBy: "created_at", limit: 500 },
      })) as unknown as Array<NumberInventoryExtra & Record<string, unknown>>;

      return Object.fromEntries(
        rows.map((row) => [
          row.id,
          {
            id: row.id,
            account_mode: row.account_mode ?? null,
            platform_type: row.platform_type ?? null,
            throughput_level: row.throughput_level ?? null,
            code_verification_status: row.code_verification_status ?? null,
          },
        ]),
      );
    },
    refetchInterval: 30_000,
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
