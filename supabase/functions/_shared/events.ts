import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function emitOutgoingEvent(
  client: SupabaseClient,
  organizationId: string,
  eventType: string,
  eventId: string | null,
  payload: Record<string, unknown>,
): Promise<number> {
  const { data: hooks, error } = await client
    .from("outgoing_webhooks")
    .select("id,event_types")
    .eq("organization_id", organizationId)
    .eq("is_enabled", true)
    .contains("event_types", [eventType]);
  if (error) throw new Error(`Outgoing webhook lookup failed: ${error.message}`);

  let queued = 0;
  for (const hook of hooks ?? []) {
    const { error: rpcError } = await client.rpc("backend_enqueue_outgoing_webhook", {
      p_organization_id: organizationId,
      p_outgoing_webhook_id: hook.id,
      p_event_type: eventType,
      p_event_id: eventId,
      p_payload: payload,
    });
    if (rpcError) {
      console.error("failed to enqueue outgoing webhook", { hook_id: hook.id, event_type: eventType, message: rpcError.message });
      continue;
    }
    queued += 1;
  }
  return queued;
}
