/**
 * Small list primitives that were previously copy-pasted per module.
 *
 * Each function keeps the ordering its former call sites had. Ordering is not
 * an implementation detail here: several artifacts are hashed or diffed after
 * being ordered, so a helper that "tidied up" a collation would move a baseline
 * as a side effect. `uniqueLocaleSorted` therefore still reads the environment's
 * collation, exactly as the scanner code it replaces did.
 */

/** Unique values in first-seen order. */
export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/** Unique, trimmed, non-empty strings in first-seen order. */
export function uniqueTrimmed(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

/** Unique non-blank strings in default (UTF-16 code unit) order. */
export function uniqueSortedNonBlank(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort();
}

/**
 * Unique strings in locale collation order.
 *
 * Locale-dependent by design, not by oversight — see the module comment.
 */
export function uniqueLocaleSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
