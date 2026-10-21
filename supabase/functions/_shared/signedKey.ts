// Signed API keys, shared by the function that checks them (shipyard-report)
// and the one that creates them (shipyard-report-keys), so the two can't drift
// apart. mint-key.mjs does the same thing for the command line.
//
// A key is  srt_<payload>.<signature>  where payload is base64url JSON and
// signature is HMAC-SHA256(payload) with DATA_API_SIGNING_SECRET. The payload
// says who the key is for, which schemas it may read and when it expires, so a
// key carries its own rules and can't be edited without breaking the signature.

export interface KeyPayload {
  v: 1;
  /** Random id, so one key can be cancelled without touching the others. */
  id: string;
  name: string;
  schemas: string[];
  /** Expiry as seconds since the epoch; absent means it never expires. */
  exp?: number;
}

export const KEY_PREFIX = "srt_";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}

export function newKeyId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Builds a key string for the payload. */
export async function encodeKey(payload: KeyPayload, secret: string): Promise<string> {
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = toBase64Url(await hmacSha256(secret, encoded));
  return `${KEY_PREFIX}${encoded}.${signature}`;
}

/**
 * Returns the payload if the key is well formed and genuinely signed with this
 * secret, otherwise null. It does NOT check expiry or revocation — callers do.
 */
export async function decodeKey(key: string, secret: string): Promise<KeyPayload | null> {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const [encoded, signature, ...rest] = key.slice(KEY_PREFIX.length).split(".");
  if (!encoded || !signature || rest.length > 0) return null;

  try {
    const expected = await hmacSha256(secret, encoded);
    if (!equalBytes(expected, fromBase64Url(signature))) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))) as KeyPayload;
    if (payload.v !== 1 || !payload.id || !Array.isArray(payload.schemas)) return null;
    return payload;
  } catch {
    return null;
  }
}
