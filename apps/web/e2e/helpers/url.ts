export function urlMatching(
  pathname: string,
  query: Record<string, string> = {},
): (url: URL) => boolean {
  return (url) =>
    url.pathname === pathname &&
    Object.entries(query).every(([key, value]) => url.searchParams.get(key) === value);
}
