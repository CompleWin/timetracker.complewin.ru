const SIGNATURE_PREFIX = "sha256=";
const HEX_DIGEST = /^[0-9a-f]{64}$/i;

export async function hasValidSignature(
  secret: string,
  body: Uint8Array,
  header: string | undefined,
): Promise<boolean> {
  if (header === undefined || !header.startsWith(SIGNATURE_PREFIX)) return false;
  const digest = header.slice(SIGNATURE_PREFIX.length);
  if (!HEX_DIGEST.test(digest)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, hexBytes(digest), body);
}

function hexBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
