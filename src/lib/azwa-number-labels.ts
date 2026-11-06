/**
 * Display names supplied for the Alazab WhatsApp number inventory.
 * Match public phone-number strings only; never match Meta IDs or internal UUIDs.
 * Names are presentation metadata, not authorization or ownership claims.
 */
const ACCOUNT_NAMES: Readonly<Record<string, string>> = Object.freeze({
  "201202334066": "Mohamed Azab",
  "201146395966": "Alazab Arc",
  "201092750351": "Alazab",
  "12054605650": "Mohamed Azab",
  "12083799564": "Mohamed Azab",
  "201146397010": "Alazab",
  "15557245001": "alazab",
  "15556782228": "Test Number",
  "12032047240": "Mohamed Azab",
});

export function normalizeWhatsappPhone(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function whatsappAccountName(phone: string | null | undefined, fallback?: string | null): string {
  const normalized = normalizeWhatsappPhone(phone);
  return ACCOUNT_NAMES[normalized] || fallback?.trim() || "حساب واتساب";
}

export function whatsappAccountLabel(phone: string | null | undefined, fallback?: string | null): string {
  const name = whatsappAccountName(phone, fallback);
  const normalized = normalizeWhatsappPhone(phone);
  return normalized ? `${name} — ${normalized}` : name;
}
