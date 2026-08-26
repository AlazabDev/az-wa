import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError } from "./http.ts";

async function rpcBoolean(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    console.error(`authorization RPC ${fn} failed`, { code: error.code, message: error.message });
    throw new HttpError(403, "Authorization check failed", "forbidden");
  }
  return data === true;
}

export async function requireOrgPermission(client: SupabaseClient, organizationId: string, permission: string): Promise<void> {
  const ok = await rpcBoolean(client, "azwa_has_org_permission", {
    p_org_id: organizationId,
    p_permission: permission,
  });
  if (!ok) throw new HttpError(403, `Missing permission: ${permission}`, "forbidden");
}

export async function requireNumberSend(client: SupabaseClient, whatsappNumberId: string): Promise<void> {
  const ok = await rpcBoolean(client, "azwa_can_send_number", { p_number_id: whatsappNumberId });
  if (!ok) throw new HttpError(403, "No send access to this WhatsApp number", "forbidden");
}

export async function requireWabaManage(client: SupabaseClient, wabaId: string, permission = "wabas.manage"): Promise<void> {
  const ok = await rpcBoolean(client, "azwa_can_manage_waba", {
    p_waba_id: wabaId,
    p_permission: permission,
  });
  if (!ok) throw new HttpError(403, `Missing WABA permission: ${permission}`, "forbidden");
}

export async function requireNumberDispatch(client: SupabaseClient, whatsappNumberId: string, permission: string): Promise<void> {
  const ok = await rpcBoolean(client, "azwa_can_dispatch_number", {
    p_number_id: whatsappNumberId,
    p_permission: permission,
  });
  if (!ok) throw new HttpError(403, `No ${permission} access to this WhatsApp number`, "forbidden");
}

export async function requireNumberManage(client: SupabaseClient, whatsappNumberId: string, permission = "numbers.manage"): Promise<void> {
  const ok = await rpcBoolean(client, "azwa_can_manage_number", {
    p_number_id: whatsappNumberId,
    p_permission: permission,
  });
  if (!ok) throw new HttpError(403, `No ${permission} management access to this WhatsApp number`, "forbidden");
}
