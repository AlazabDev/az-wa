const encoder = new TextEncoder();

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? encoder.encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(new Uint8Array(digest));
}

export async function hmacSha256Hex(secret: string, data: ArrayBuffer | Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const signature = await crypto.subtle.sign("HMAC", key, bytes);
  return toHex(new Uint8Array(signature));
}

export function constantTimeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  const max = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < max; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function normalizeMetaSignature(value: string | null): string | null {
  if (!value) return null;
  const match = value.trim().match(/^sha256=([0-9a-f]{64})$/i);
  return match ? match[1].toLowerCase() : null;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
