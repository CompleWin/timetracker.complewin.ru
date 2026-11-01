import { userResponse, type DevLoginBody, type UpdateMeBody, type User } from "@stt/shared";
import { z } from "zod";

const healthResponse = z.object({ env: z.string() });

export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`Request failed with status ${status}`);
  }
}

export async function fetchEnvironment(): Promise<string> {
  return healthResponse.parse(await request("GET", "/api/health")).env;
}

export async function fetchCurrentUser(): Promise<User | null> {
  try {
    return userResponse.parse(await request("GET", "/api/me")).user;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) return null;
    throw error;
  }
}

export async function devLogin(body: DevLoginBody = {}): Promise<User> {
  return userResponse.parse(await request("POST", "/auth/dev-login", body)).user;
}

export async function updateMe(body: UpdateMeBody): Promise<User> {
  return userResponse.parse(await request("PATCH", "/api/me", body)).user;
}

export async function logout(): Promise<void> {
  await request("POST", "/auth/logout");
}

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new HttpError(response.status);
  return response.status === 204 ? null : response.json();
}
