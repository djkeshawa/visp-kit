/**
 * Cross-cutting helpers a task should reuse instead of reinventing.
 *
 * Phase 18 measured the cost of not doing this. Two agents were given the same
 * vague failure-handling request on an 8,800-line codebase; both built a new
 * error surface that printed raw error strings, in a project whose own
 * `database/mod.rs` masks every printed error because those strings carry
 * connection credentials. Neither found `utils/secrets.rs`.
 *
 * The knowledge was never missing — `visp-kit scan` already indexes every
 * file's symbols, and `mask_error_message` and `mask_uri` were sitting in the
 * cache the whole time. It simply never reached the agent. This module reads
 * what scan already knows and puts the reusable names in front of whoever is
 * about to write the code.
 *
 * The patterns are deliberately generic. Tuning them to one repository would
 * make the benchmark pass and help nobody; these are the names this class of
 * helper carries across languages and ecosystems.
 */

export type ReuseHelper = {
  /** Where the helper lives, so the reader can open it. */
  readonly path: string;
  /** The concern it covers, phrased for a one-line prompt. */
  readonly concern: string;
  /** Matching symbol names, capped — a signpost, not a symbol dump. */
  readonly symbols: readonly string[];
};

type ScannedFile = {
  readonly path: string;
  readonly symbols: readonly string[];
};

const CONCERNS: ReadonlyArray<{ readonly concern: string; readonly pattern: RegExp }> = [
  // Output safety first: it is the one whose absence leaks credentials.
  { concern: "redacting secrets from output", pattern: /^(mask|redact|scrub|sanitiz|obfuscat|anonymiz|hide|conceal)/u },
  { concern: "validating untrusted input", pattern: /^(validate|verify|check|assert)[_A-Z]/u },
  { concern: "resuming interrupted work", pattern: /(resum|checkpoint|restore)/iu },
  { concern: "retrying and backoff", pattern: /^(retry|backoff|with_retry)/iu }
];

/** Test symbols describe the helper; they are not the helper. */
function isTestSymbol(symbol: string): boolean {
  return /^(test_|it_|should_)/u.test(symbol) || /_test$/u.test(symbol);
}

/** A file that only defines tests is not a helper to reuse. */
function isTestFile(path: string): boolean {
  return /(^|\/)(tests?|__tests__|spec)\//u.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/u.test(path);
}

const MAX_SYMBOLS_PER_FILE = 4;
const MAX_HELPERS = 5;

/**
 * Find reusable cross-cutting helpers among scanned files.
 *
 * Ranked by concern order, so output-safety helpers lead: a context pack is
 * budgeted, and if only one line survives truncation it should be the one
 * that prevents a credential reaching a terminal.
 */
export function findReuseHelpers(files: readonly ScannedFile[]): readonly ReuseHelper[] {
  const found: ReuseHelper[] = [];

  for (const { concern, pattern } of CONCERNS) {
    for (const file of files) {
      if (isTestFile(file.path)) continue;

      const symbols = file.symbols.filter(
        (symbol) => !isTestSymbol(symbol) && pattern.test(symbol)
      );
      if (symbols.length === 0) continue;
      if (found.some((helper) => helper.path === file.path && helper.concern === concern)) {
        continue;
      }

      found.push({
        path: file.path,
        concern,
        symbols: symbols.slice(0, MAX_SYMBOLS_PER_FILE)
      });
      if (found.length >= MAX_HELPERS) return found;
    }
  }

  return found;
}

/** One line per helper, for the context pack and the task prompt. */
export function renderReuseHelpers(helpers: readonly ReuseHelper[]): string {
  if (helpers.length === 0) return "";
  return helpers
    .map((helper) => `- ${helper.path} — ${helper.concern}: ${helper.symbols.join(", ")}`)
    .join("\n");
}
