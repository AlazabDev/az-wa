/**
 * Webhook gateway helpers — server only.
 * Endpoint identification and X-Hub-Signature-256 validation are driven by
 * credentials stored in the database (Vault), never by hardcoded env values.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type WebhookSecret = {
  webhook_endpoint_id: string;
  organization_id: string;
  meta_app_id: string | null;
  verify_token: string | null;
  app_secret: string | null;
};

export async function listWebhookSecrets(): Promise<WebhookSecret[]> {
  const { data, error } = await supabaseAdmin.rpc("backend_list_webhook_secrets");
  if (error) throw new Error(error.message);
  return (data ?? []) as WebhookSecret[];
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Returns the endpoint whose stored verify token matches the challenge. */
export function matchVerifyToken(secrets: WebhookSecret[], token: string | null) {
  if (!token) return null;
  return secrets.find((s) => s.verify_token && safeEqual(s.verify_token, token)) ?? null;
}

/**
 * Finds the endpoint whose app secret produces the received signature.
 * Falls back to the single active endpoint (marked signature_valid=false) so a
 * misconfigured secret still leaves an auditable trail instead of silence.
 */
export function matchSignature(
  secrets: WebhookSecret[],
  raw: string,
  header: string | null,
): { endpoint: WebhookSecret | null; signatureValid: boolean } {
  if (header) {
    for (const s of secrets) {
      if (!s.app_secret) continue;
      const expected = "sha256=" + createHmac("sha256", s.app_secret).update(raw).digest("hex");
      if (safeEqual(header, expected)) return { endpoint: s, signatureValid: true };
    }
  }
  return { endpoint: secrets.length === 1 ? (secrets[0] ?? null) : null, signatureValid: false };
}
