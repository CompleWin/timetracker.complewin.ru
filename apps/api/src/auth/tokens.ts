import { base64url } from "jose";

export function randomToken(byteLength = 32): string {
  return base64url.encode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return base64url.encode(new Uint8Array(digest));
}
