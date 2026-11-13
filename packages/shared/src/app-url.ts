export type AppUrl = {
  appUrl: string;
  host: string;
  customDomain: boolean;
};

const WORKERS_DEV_SUFFIX = ".workers.dev";

function invalidAppUrl(name: string, value: string): Error {
  return new Error(
    `${name} must be https://<host> without a path, query, fragment, port or credentials, got "${value}"`,
  );
}

function parsedUrl(name: string, value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw invalidAppUrl(name, value);
  }
}

function isBareHttpsOrigin(url: URL, value: string): boolean {
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    url.origin === value.toLowerCase().replace(/\/$/, "")
  );
}

export function parseAppUrl(name: string, value: string | undefined): AppUrl {
  if (value === undefined || value === "") throw new Error(`${name} is not set`);
  const url = parsedUrl(name, value);
  if (!isBareHttpsOrigin(url, value)) throw invalidAppUrl(name, value);
  return {
    appUrl: url.origin,
    host: url.hostname,
    customDomain: !url.hostname.endsWith(WORKERS_DEV_SUFFIX),
  };
}
