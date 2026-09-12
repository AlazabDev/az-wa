/**
 * WhatsApp number administration — server only.
 * Handles metadata refresh and status updates for WhatsApp numbers.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MetaGraphClient, resolveCredential } from "./graph.server";

/**
 * Syncs metadata for a WhatsApp number from Meta's Graph API.
 * Updates phone number details, quality ratings, and messaging limits.
 */
export async function syncNumberMetadata(numberId: string): Promise<void> {
  const { data: number, error: numberError } = await supabaseAdmin
    .from("whatsapp_numbers")
    .select("id, organization_id, waba_id, meta_phone_number_id")
    .eq("id", numberId)
    .maybeSingle();

  if (numberError || !number) {
    throw new Error("WhatsApp number not found");
  }

  const { data: waba, error: wabaError } = await supabaseAdmin
    .from("wabas")
    .select("id, business_portfolio_id")
    .eq("id", number.waba_id)
    .maybeSingle();

  if (wabaError || !waba) {
    throw new Error("WABA not found for this number");
  }

  // Resolve credential for this business scope
  const credential = await resolveCredential({
    businessPortfolioId: waba.business_portfolio_id ?? undefined,
  });

  if (!credential.token) {
    throw new Error("No Meta access token available for this number's scope");
  }

  const client = new MetaGraphClient(credential.token, {
    organizationId: number.organization_id,
    whatsappNumberId: number.id,
    wabaId: number.waba_id,
    businessPortfolioId: waba.business_portfolio_id,
  });

  // Fetch number details from Meta Graph API
  const result = await client.request<{
    id?: string;
    display_phone_number?: string;
    quality_rating?: string;
    status?: string;
    messaging_limit?: number | null;
  }>(`${number.meta_phone_number_id}`);

  if (!result.ok || !result.data) {
    throw new Error(`Failed to fetch number metadata: ${result.errorMessage}`);
  }

  const updateData: Record<string, unknown> = {};

  if (result.data.display_phone_number) {
    updateData.display_phone_number = result.data.display_phone_number;
  }
  if (result.data.quality_rating) {
    updateData.quality_rating = result.data.quality_rating;
  }
  if (result.data.status) {
    updateData.status = result.data.status;
  }
  if (result.data.messaging_limit !== undefined) {
    updateData.messaging_limit = result.data.messaging_limit;
  }

  // Update the number in database
  if (Object.keys(updateData).length > 0) {
    const { error: updateError } = await supabaseAdmin
      .from("whatsapp_numbers")
      .update(updateData)
      .eq("id", number.id);

    if (updateError) {
      throw new Error(`Failed to update number: ${updateError.message}`);
    }
  }
}
