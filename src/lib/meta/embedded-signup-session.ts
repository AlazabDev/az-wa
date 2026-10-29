/**
 * Meta WhatsApp Embedded Signup browser event parser.
 * Does not persist identifiers or exchange OAuth codes.
 */
export type SignupSessionEvent =
  | { kind: "finished"; wabaId: string; phoneNumberId: string; businessId: string | null }
  | { kind: "cancelled"; currentStep: string | null }
  | { kind: "error"; message: string | null };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const optionalString = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

export function parseEmbeddedSignupEvent(
  origin: string,
  raw: unknown,
): SignupSessionEvent | null {
  if (origin !== "https://www.facebook.com") return null;

  let payload: unknown = raw;
  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(payload) || payload.type !== "WA_EMBEDDED_SIGNUP") return null;
  const data = isRecord(payload.data) ? payload.data : {};

  if (payload.event === "FINISH") {
    const wabaId = optionalString(data.waba_id);
    const phoneNumberId = optionalString(data.phone_number_id);
    if (!wabaId || !phoneNumberId) return null;
    return {
      kind: "finished",
      wabaId,
      phoneNumberId,
      businessId: optionalString(data.business_id),
    };
  }
  if (payload.event === "CANCEL") {
    return { kind: "cancelled", currentStep: optionalString(data.current_step) };
  }
  if (payload.event === "ERROR") {
    return { kind: "error", message: optionalString(data.error_message) };
  }
  return null;
}

export function subscribeToEmbeddedSignup(
  onEvent: (event: SignupSessionEvent) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: MessageEvent) => {
    const signup = parseEmbeddedSignupEvent(event.origin, event.data);
    if (signup) onEvent(signup);
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
