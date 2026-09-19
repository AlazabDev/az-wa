import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PerNumberMessageStats = Record<
  string,
  { total: number; incoming: number; outgoing: number; failed: number }
>;

export const getPerNumberMessages24h = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { numberIds: string[] }) => input)
  .handler(async ({ data, context }): Promise<PerNumberMessageStats> => {
    const { supabaseAdmin, supabaseRuntimeAdmin } =
      await import("@/integrations/supabase/client.server");

    const { data: organization, error: organizationError } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("slug", "alazab-group")
      .maybeSingle();
    if (organizationError || !organization?.id) {
      throw new Error(organizationError?.message ?? "AzWA organization not found");
    }

    const { data: allowed, error: permissionError } = await context.supabase.rpc(
      "azwa_has_org_permission",
      { p_org_id: organization.id, p_permission: "messages.read" },
    );
    if (permissionError || !allowed) throw new Error("Forbidden");

    const numberIds = [
      ...new Set((data.numberIds ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id))),
    ];
    if (numberIds.length === 0) return {};

    // Validate scope before querying messages.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runtime = supabaseRuntimeAdmin as any;
    const { data: numbers, error: numberError } = await runtime
      .from("whatsapp_numbers")
      .select("id")
      .eq("organization_id", organization.id)
      .in("id", numberIds);
    if (numberError) throw new Error(numberError.message);
    if ((numbers ?? []).length !== numberIds.length) throw new Error("Invalid number scope");

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: messages, error: messageError } = await runtime
      .from("messages")
      .select("whatsapp_number_id,direction,status")
      .eq("organization_id", organization.id)
      .in("whatsapp_number_id", numberIds)
      .gte("created_at", since)
      .limit(10_000);
    if (messageError) throw new Error(messageError.message);

    const result: PerNumberMessageStats = Object.fromEntries(
      numberIds.map((id) => [id, { total: 0, incoming: 0, outgoing: 0, failed: 0 }]),
    );

    for (const row of messages ?? []) {
      const id = String(row.whatsapp_number_id);
      const entry = result[id];
      if (!entry) continue;
      entry.total += 1;
      if (row.direction === "incoming") entry.incoming += 1;
      if (row.direction === "outgoing") entry.outgoing += 1;
      if (row.status === "failed") entry.failed += 1;
    }

    return result;
  });
