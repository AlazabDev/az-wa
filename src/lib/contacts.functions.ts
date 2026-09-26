/**
 * Contact management server functions.
 * Create, update and delete contacts and their WhatsApp channels.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ContactInput = {
  displayName: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
};

export type ContactChannelInput = {
  contactId: string;
  address: string;     // WhatsApp phone number
  profileName?: string | null;
  isPrimary?: boolean;
};

async function authorize(context: any, permission = "contacts.manage") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: org, error } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("slug", "alazab-group")
    .maybeSingle();
  if (error || !org?.id) throw new Error(error?.message ?? "Organization not found");

  const { data: allowed, error: permError } = await context.supabase.rpc(
    "azwa_has_org_permission",
    { p_org_id: org.id, p_permission: permission },
  );
  if (permError || !allowed) throw new Error("Forbidden");
  return { organizationId: org.id as string, supabaseAdmin };
}

/** Create a new contact with an optional primary WhatsApp channel. */
export const createContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: ContactInput & { primaryPhone?: string | null }) => input,
  )
  .handler(async ({ data, context }): Promise<{ ok: true; contactId: string }> => {
    const { organizationId, supabaseAdmin } = await authorize(context);
    const { supabaseRuntimeAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.displayName.trim()) throw new Error("Display name is required");

    const now = new Date().toISOString();
    const { data: contact, error } = await (supabaseRuntimeAdmin as any)
      .from("contacts")
      .insert({
        organization_id: organizationId,
        display_name: data.displayName.trim(),
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        company: data.company?.trim() || null,
        notes: data.notes?.trim() || null,
        source: "manual",
        status: "active",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (error || !contact?.id) throw new Error(error?.message ?? "Failed to create contact");
    const contactId = String(contact.id);

    // Add primary WhatsApp channel if provided
    if (data.primaryPhone?.trim()) {
      const phone = data.primaryPhone.replace(/[^0-9]/g, "").trim();
      if (phone.length >= 7) {
        await (supabaseRuntimeAdmin as any).from("contact_channels").insert({
          organization_id: organizationId,
          contact_id: contactId,
          channel_type: "whatsapp",
          address: phone,
          wa_id: phone,
          is_primary: true,
          created_at: now,
          updated_at: now,
        });
      }
    }

    return { ok: true, contactId };
  });

/** Update contact fields. */
export const updateContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: ContactInput & { contactId: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { organizationId } = await authorize(context);
    const { supabaseRuntimeAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.displayName.trim()) throw new Error("Display name is required");

    const { error } = await (supabaseRuntimeAdmin as any)
      .from("contacts")
      .update({
        display_name: data.displayName.trim(),
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        company: data.company?.trim() || null,
        notes: data.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.contactId)
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Soft-delete a contact (set status to archived). */
export const deleteContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { contactId: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { organizationId } = await authorize(context);
    const { supabaseRuntimeAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await (supabaseRuntimeAdmin as any)
      .from("contacts")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", data.contactId)
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Add a WhatsApp channel to a contact. */
export const addContactChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: ContactChannelInput) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { organizationId } = await authorize(context);
    const { supabaseRuntimeAdmin } = await import("@/integrations/supabase/client.server");

    const phone = data.address.replace(/[^0-9]/g, "").trim();
    if (phone.length < 7) throw new Error("Invalid phone number");

    const now = new Date().toISOString();

    // If marking as primary, demote existing primary
    if (data.isPrimary) {
      await (supabaseRuntimeAdmin as any)
        .from("contact_channels")
        .update({ is_primary: false, updated_at: now })
        .eq("contact_id", data.contactId)
        .eq("organization_id", organizationId)
        .eq("channel_type", "whatsapp")
        .eq("is_primary", true);
    }

    const { error } = await (supabaseRuntimeAdmin as any).from("contact_channels").insert({
      organization_id: organizationId,
      contact_id: data.contactId,
      channel_type: "whatsapp",
      address: phone,
      wa_id: phone,
      profile_name: data.profileName?.trim() || null,
      is_primary: data.isPrimary ?? false,
      created_at: now,
      updated_at: now,
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Remove a contact channel. */
export const removeContactChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { channelId: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { organizationId } = await authorize(context);
    const { supabaseRuntimeAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await (supabaseRuntimeAdmin as any)
      .from("contact_channels")
      .delete()
      .eq("id", data.channelId)
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Search contacts by name, email or phone. */
export const searchContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { query: string; limit?: number }) => input)
  .handler(async ({ data, context }) => {
    const { organizationId } = await authorize(context, "contacts.read");
    const { supabaseRuntimeAdmin } = await import("@/integrations/supabase/client.server");

    const q = `%${data.query.trim().replace(/[%_]/g, " ")}%`;
    const limit = Math.min(50, data.limit ?? 20);

    const { data: rows, error } = await (supabaseRuntimeAdmin as any)
      .from("contacts")
      .select("id, display_name, email, phone, company, status")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .or(`display_name.ilike.${q},email.ilike.${q},phone.ilike.${q}`)
      .order("display_name")
      .limit(limit);

    if (error) throw new Error(error.message);
    return rows ?? [];
  });
