import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";
import type { Bindings } from "../env.ts";
import { sha256 } from "./tokens.ts";

const DEFAULT_OAUTH_BASE = "https://oauth.telegram.org";
const DISCOVERY_PATH = "/.well-known/openid-configuration";
const DISCOVERY_TTL_MS = 60 * 60_000;
const MAX_ISSUED_AHEAD_SEC = 60;
const SCOPE = "openid profile telegram:bot_access";

const discoverySchema = z.object({
  issuer: z.string(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  jwks_uri: z.url(),
  token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
});

const tokenResponseSchema = z.object({
  id_token: z.string(),
  scope: z.string().optional(),
});

export type Discovery = z.infer<typeof discoverySchema>;

export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export type TelegramClient = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  discoveryUrl: string;
};

export type AuthorizationRequest = {
  state: string;
  nonce: string;
  codeVerifier: string;
};

type CachedDiscovery = { document: Discovery; expiresAt: number };

type SigningKeys = ReturnType<typeof createRemoteJWKSet>;

const discoveryCache = new Map<string, CachedDiscovery>();
const signingKeysCache = new Map<string, SigningKeys>();

export function telegramClient(env: Bindings): TelegramClient {
  return {
    clientId: env.TG_CLIENT_ID,
    clientSecret: env.TG_CLIENT_SECRET,
    redirectUri: `${env.APP_URL}/auth/telegram/callback`,
    discoveryUrl: `${env.TG_OAUTH_BASE ?? DEFAULT_OAUTH_BASE}${DISCOVERY_PATH}`,
  };
}

export async function loadDiscovery(client: TelegramClient): Promise<Discovery> {
  const cached = discoveryCache.get(client.discoveryUrl);
  if (cached !== undefined && cached.expiresAt > Date.now()) return cached.document;
  const document = discoverySchema.parse(await fetchJson(client.discoveryUrl));
  discoveryCache.set(client.discoveryUrl, { document, expiresAt: Date.now() + DISCOVERY_TTL_MS });
  return document;
}

export async function authorizationUrl(
  client: TelegramClient,
  discovery: Discovery,
  request: AuthorizationRequest,
): Promise<string> {
  const url = new URL(discovery.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: "code",
    scope: SCOPE,
    state: request.state,
    nonce: request.nonce,
    code_challenge: await sha256(request.codeVerifier),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export async function exchangeCode(
  client: TelegramClient,
  discovery: Discovery,
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: client.redirectUri,
    code_verifier: codeVerifier,
    client_id: client.clientId,
  });
  const headers = new Headers({ "Content-Type": "application/x-www-form-urlencoded" });
  if (prefersBasicAuth(discovery)) {
    headers.set("Authorization", basicAuthorization(client));
  } else {
    body.set("client_secret", client.clientSecret);
  }
  const response = await fetch(discovery.token_endpoint, { method: "POST", headers, body });
  if (!response.ok) throw new Error(`Token endpoint answered ${response.status}`);
  return tokenResponseSchema.parse(await response.json());
}

export async function verifyIdToken(
  client: TelegramClient,
  discovery: Discovery,
  idToken: string,
  expected: { nonce: string; now: Date },
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(idToken, signingKeys(discovery.jwks_uri), {
    issuer: discovery.issuer,
    audience: client.clientId,
    currentDate: expected.now,
    requiredClaims: ["exp", "iat"],
  });
  if (isIssuedTooFarAhead(payload, expected.now)) throw new Error("id_token iat is in the future");
  if (payload.nonce !== expected.nonce) throw new Error("id_token nonce mismatch");
  return payload;
}

function signingKeys(jwksUri: string): SigningKeys {
  const cached = signingKeysCache.get(jwksUri);
  if (cached !== undefined) return cached;
  const keys = createRemoteJWKSet(new URL(jwksUri), { cooldownDuration: 0 });
  signingKeysCache.set(jwksUri, keys);
  return keys;
}

function isIssuedTooFarAhead(payload: JWTPayload, now: Date): boolean {
  const latestIssuedAt = Math.floor(now.getTime() / 1000) + MAX_ISSUED_AHEAD_SEC;
  return (payload.iat ?? 0) > latestIssuedAt;
}

function prefersBasicAuth(discovery: Discovery): boolean {
  const methods = discovery.token_endpoint_auth_methods_supported;
  return (
    methods === undefined ||
    methods.includes("client_secret_basic") ||
    !methods.includes("client_secret_post")
  );
}

function basicAuthorization({ clientId, clientSecret }: TelegramClient): string {
  return `Basic ${btoa(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`)}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}
