export function archivedAtAfter(
  archivedAt: Date | null,
  archived: boolean | undefined,
  now: Date,
): Date | null {
  if (archived === undefined) return archivedAt;
  return archived ? (archivedAt ?? now) : null;
}
