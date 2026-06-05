const placeholderReasons = new Set([
  "test",
  "skip",
  "because",
  "n/a",
  "na",
  "none",
  "temp",
  "temporary"
]);

export function validateOverrideReason(reason: string | undefined): readonly string[] {
  const value = reason?.trim() ?? "";
  const normalized = value.toLowerCase();

  if (value.length === 0) {
    return ["Override reason is required."];
  }

  if (value.length < 12) {
    return ["Override reason must be at least 12 characters."];
  }

  if (placeholderReasons.has(normalized)) {
    return ["Override reason must be meaningful, not a placeholder."];
  }

  return [];
}

export function normalizeOverrideReason(reason: string): string {
  return reason.trim().replace(/\s+/g, " ");
}
