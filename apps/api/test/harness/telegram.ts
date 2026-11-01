import { api, type Opts, type TestResponse } from "./api.ts";
import { base64url, base64urlJson } from "./encoding.ts";
import { external, type ExternalCall } from "./external.ts";
import { expectRedirect } from "./redirect.ts";
import { expectNoSessionCookie } from "./session.ts";
import { testEnv } from "./test-env.ts";

export type Claims = Record<string, unknown>;

export type SigningKeyName = "telegram" | "stranger";

export type TokenReply = {
  claims?: Claims;
  scope?: string;
  signingKey?: SigningKeyName;
  kid?: string;
  status?: number;
  withoutIdToken?: boolean;
};

export type LoginAttempt = {
  authorizationUrl: URL;
  state: string;
  nonce: string;
  code: string;
};

export type SignInError = "cancelled" | "state" | "token" | "unavailable";

export type FakeTelegram = {
  start(returnTo?: string, opts?: Opts): Promise<LoginAttempt>;
  callback(attempt: LoginAttempt, reply?: TokenReply, opts?: Opts): Promise<TestResponse>;
  cancel(attempt: LoginAttempt, opts?: Opts): Promise<TestResponse>;
  login(reply?: TokenReply, opts?: Opts): Promise<TestResponse>;
  tokenRequests(): ExternalCall[];
};

type PendingReply = {
  nonce: string;
  issuedAtMs: number;
  reply: TokenReply;
};

export const TELEGRAM_ISSUER = "https://oauth.telegram.org";
export const TELEGRAM_KEY_ID = "telegram-signing-key";
export const TELEGRAM_CALLBACK_URL = `${testEnv.APP_URL}/auth/telegram/callback`;
export const BOT_ACCESS_SCOPE = "openid profile telegram:bot_access";

export const telegramEndpoints = {
  discovery: `${testEnv.TG_OAUTH_BASE}/.well-known/openid-configuration`,
  authorization: `${testEnv.TG_OAUTH_BASE}/auth`,
  token: `${testEnv.TG_OAUTH_BASE}/token`,
  jwks: `${testEnv.TG_OAUTH_BASE}/.well-known/jwks.json`,
} as const;

export const telegramProfile = {
  telegramId: 1001,
  name: "Ivan Petrov",
  username: "ivan_petrov",
  photoUrl: "https://t.me/i/userpic/320/ivan_petrov.jpg",
} as const;

const discoveryDocument = {
  issuer: TELEGRAM_ISSUER,
  authorization_endpoint: telegramEndpoints.authorization,
  token_endpoint: telegramEndpoints.token,
  jwks_uri: telegramEndpoints.jwks,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code"],
  subject_types_supported: ["public"],
  scopes_supported: ["openid", "profile", "telegram:bot_access"],
  id_token_signing_alg_values_supported: ["RS256"],
  token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
  code_challenge_methods_supported: ["S256"],
};

const keyIds: Record<SigningKeyName, string> = {
  telegram: TELEGRAM_KEY_ID,
  stranger: "stranger-signing-key",
};

const keyPairs = new Map<SigningKeyName, CryptoKeyPair>();

export async function fakeTelegram(): Promise<FakeTelegram> {
  const jwks = { keys: [await publicJwk("telegram")] };
  const pendingReplies = new Map<string, PendingReply>();

  external.on("GET", telegramEndpoints.discovery, () => Response.json(discoveryDocument));
  external.on("GET", telegramEndpoints.jwks, () => Response.json(jwks));
  external.on("POST", telegramEndpoints.token, async (request) => {
    const code = new URLSearchParams(await request.text()).get("code") ?? "";
    const pending = pendingReplies.get(code);
    if (pending === undefined) return Response.json({ error: "invalid_grant" }, { status: 400 });
    return tokenResponse(pending);
  });

  async function start(returnTo?: string, opts?: Opts): Promise<LoginAttempt> {
    const response = await api.get(startPath(returnTo), opts);
    const location = response.headers.get("Location");
    if (response.status !== 302 || location === null) {
      throw new Error(`GET /auth/telegram/start answered ${response.status} without redirect`);
    }
    const authorizationUrl = new URL(location, testEnv.APP_URL);
    return {
      authorizationUrl,
      state: authorizationUrl.searchParams.get("state") ?? "",
      nonce: authorizationUrl.searchParams.get("nonce") ?? "",
      code: crypto.randomUUID(),
    };
  }

  function callback(
    attempt: LoginAttempt,
    reply: TokenReply = {},
    opts: Opts = {},
  ): Promise<TestResponse> {
    pendingReplies.set(attempt.code, { nonce: attempt.nonce, issuedAtMs: nowMs(opts), reply });
    return api.get(callbackPath({ code: attempt.code, state: attempt.state }), opts);
  }

  function cancel(attempt: LoginAttempt, opts?: Opts): Promise<TestResponse> {
    return api.get(callbackPath({ error: "access_denied", state: attempt.state }), opts);
  }

  async function login(reply?: TokenReply, opts?: Opts): Promise<TestResponse> {
    return callback(await start(), reply, opts);
  }

  function tokenRequests(): ExternalCall[] {
    return external.calls({ method: "POST", url: telegramEndpoints.token });
  }

  return { start, callback, cancel, login, tokenRequests };
}

export function startPath(returnTo?: string): string {
  const query = returnTo === undefined ? "" : `?${new URLSearchParams({ returnTo })}`;
  return `/auth/telegram/start${query}`;
}

export function expectSignInError(response: TestResponse, error: SignInError): void {
  expectRedirect(response, `/login?error=${error}`);
  expectNoSessionCookie(response);
}

export function secondsFromNow(offsetSec: number): number {
  return Math.floor(Date.now() / 1000) + offsetSec;
}

function callbackPath(params: Record<string, string>): string {
  return `/auth/telegram/callback?${new URLSearchParams(params)}`;
}

function nowMs({ now }: Opts): number {
  return now === undefined ? Date.now() : Date.parse(now);
}

function defaultClaims(nonce: string, issuedAtSec: number): Claims {
  return {
    iss: TELEGRAM_ISSUER,
    aud: testEnv.TG_CLIENT_ID,
    sub: String(telegramProfile.telegramId),
    iat: issuedAtSec,
    exp: issuedAtSec + 3600,
    nonce,
    id: telegramProfile.telegramId,
    name: telegramProfile.name,
    preferred_username: telegramProfile.username,
    picture: telegramProfile.photoUrl,
  };
}

async function tokenResponse({ nonce, issuedAtMs, reply }: PendingReply): Promise<Response> {
  const claims = { ...defaultClaims(nonce, Math.floor(issuedAtMs / 1000)), ...reply.claims };
  const signingKey = reply.signingKey ?? "telegram";
  const idToken = reply.withoutIdToken
    ? undefined
    : await signIdToken(claims, signingKey, reply.kid ?? keyIds[signingKey]);
  return Response.json(
    {
      access_token: "telegram-access-token",
      token_type: "Bearer",
      expires_in: 3600,
      scope: reply.scope ?? BOT_ACCESS_SCOPE,
      id_token: idToken,
    },
    { status: reply.status ?? 200 },
  );
}

async function signIdToken(
  claims: Claims,
  signingKey: SigningKeyName,
  kid: string,
): Promise<string> {
  const signingInput = `${base64urlJson({ alg: "RS256", typ: "JWT", kid })}.${base64urlJson(claims)}`;
  const { privateKey } = await keyPair(signingKey);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

async function publicJwk(name: SigningKeyName): Promise<JsonWebKey & { kid: string }> {
  const exported = await crypto.subtle.exportKey("jwk", (await keyPair(name)).publicKey);
  if (exported instanceof ArrayBuffer) throw new Error("JWK export returned raw bytes");
  return {
    kty: exported.kty,
    n: exported.n,
    e: exported.e,
    alg: "RS256",
    use: "sig",
    kid: keyIds[name],
  };
}

async function keyPair(name: SigningKeyName): Promise<CryptoKeyPair> {
  const existing = keyPairs.get(name);
  if (existing !== undefined) return existing;
  const created = await generateRsaKeyPair();
  keyPairs.set(name, created);
  return created;
}

async function generateRsaKeyPair(): Promise<CryptoKeyPair> {
  const generated = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  if (!("privateKey" in generated)) throw new Error("RSA key generation returned a single key");
  return generated;
}
