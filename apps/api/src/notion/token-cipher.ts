import { base64url } from "jose";

const ALGORITHM = "AES-GCM";
const IV_BYTES = 12;
const SEPARATOR = ".";

export async function encryptToken(secret: string, token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    await importKey(secret),
    new TextEncoder().encode(token),
  );
  return [iv, new Uint8Array(encrypted)].map((bytes) => base64url.encode(bytes)).join(SEPARATOR);
}

export async function decryptToken(secret: string, sealed: string): Promise<string> {
  const [iv = "", encrypted = ""] = sealed.split(SEPARATOR);
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: base64url.decode(iv) },
    await importKey(secret),
    base64url.decode(encrypted),
  );
  return new TextDecoder().decode(decrypted);
}

function importKey(secret: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(secret), (char) => char.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, ALGORITHM, false, ["encrypt", "decrypt"]);
}
