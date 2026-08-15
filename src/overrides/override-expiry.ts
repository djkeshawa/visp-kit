const durationPattern = /^(\d+)(d)$/;

export function parseOverrideExpiry(value: string | undefined, now: string): string | null {
  if (value === undefined || value.trim().length === 0) return null;

  const trimmed = value.trim();
  const duration = durationPattern.exec(trimmed);

  if (duration !== null) {
    const days = Number.parseInt(duration[1] ?? "0", 10);
    const date = new Date(now);

    if (!Number.isFinite(days) || days <= 0 || Number.isNaN(date.getTime())) {
      throw new Error("--expires duration must be a positive day count such as 7d.");
    }

    date.setUTCDate(date.getUTCDate() + days);

    // A day count large enough to run past the representable date range leaves
    // an Invalid Date, and `toISOString` then throws a bare RangeError that
    // reaches the user as "Invalid time value". Report it as the input problem
    // it is.
    if (Number.isNaN(date.getTime())) {
      throw new Error("--expires duration is too large to express as a date.");
    }

    return date.toISOString();
  }

  const date = new Date(trimmed);

  if (Number.isNaN(date.getTime())) {
    throw new Error("--expires must be an ISO datetime or a duration such as 7d.");
  }

  return date.toISOString();
}

export function overrideExpired(input: {
  readonly expiresAt?: string | null;
  readonly now: string;
}): boolean {
  if (input.expiresAt === undefined || input.expiresAt === null) return false;

  const expiresAt = new Date(input.expiresAt).getTime();
  const now = new Date(input.now).getTime();

  // An unparseable expiry or clock leaves the override's validity window
  // unknown. Treat unknown as expired so a malformed date cannot keep a
  // gate suppressed forever. The schema rejects malformed values on every
  // validated read path, so this is the defense-in-depth case.
  if (Number.isNaN(expiresAt) || Number.isNaN(now)) return true;
  return expiresAt <= now;
}
