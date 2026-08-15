import { isPlaceholderText, placeholderReason } from "../validators/semantic-lint.js";

/**
 * Is this `validationCommands` entry something a shell can run?
 *
 * Verification takes `validationCommands` from the task graph and hands them to
 * a shell. Nothing ever asked whether they were commands. In the head-to-head
 * run the agent filled the task template's `validationCommand: "TBD"` with what
 * a reasonable person writes when the check is a manual one — an English
 * sentence — and Kit executed it. `/bin/sh` answered `Manually: not found`,
 * verification recorded "Command failed", and the agent was sent to debug a
 * test suite that had never been asked to run. Three of that run's four verify
 * failures were this, and none of them said what was actually wrong.
 *
 * A sentence is not a failing check. It is a MISSING check wearing the costume
 * of one, and the two need opposite responses: a failing check means fix the
 * code, a missing check means write a check. Executing prose produces the first
 * message for the second problem, which is the most expensive kind of wrong
 * answer this tool can give.
 */
export type ValidationCommandKind = "executable" | "prose" | "placeholder";

export type ValidationCommandClassification = {
  readonly command: string;
  readonly kind: ValidationCommandKind;
  /** Why, phrased for the person who has to fix the entry. Null when runnable. */
  readonly reason: string | null;
};

/**
 * Program names common enough that their bare appearance settles the question.
 *
 * This list only ever ADDS confidence that something is runnable; nothing is
 * rejected for being absent from it, so it does not need to be complete and a
 * project's own tooling is never penalised for not being here.
 */
const KNOWN_RUNNERS = new Set([
  "bash",
  "biome",
  "bun",
  "bundle",
  "cargo",
  "cmake",
  "composer",
  "deno",
  "docker",
  "dotnet",
  "eslint",
  "gcc",
  "go",
  "gradle",
  "gradlew",
  "jest",
  "make",
  "mix",
  "mvn",
  "node",
  "npm",
  "npx",
  "phpunit",
  "playwright",
  "pnpm",
  "poetry",
  "prettier",
  "pytest",
  "python",
  "python3",
  "rake",
  "ruby",
  "rspec",
  "sbt",
  "sh",
  "swift",
  "tox",
  "tsc",
  "tsx",
  "vitest",
  "yarn",
  "zsh"
]);

/**
 * English function words, as standalone tokens.
 *
 * Deliberately closed and small. Every entry is a word that carries no meaning
 * on a command line, so a token equal to one of these is evidence of a
 * sentence — while `the-thing`, `and.js`, or `--for` are untouched because the
 * match is on the whole token.
 */
const FUNCTION_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "does",
  "each",
  "ensure",
  "every",
  "from",
  "into",
  "is",
  "it",
  "its",
  "manually",
  "must",
  "of",
  "on",
  "or",
  "should",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "this",
  "was",
  "were",
  "when",
  "whether",
  "will",
  "with",
  "without"
]);

/** Only the unambiguous ones. `?`, `!` and `#` are punctuation in English too. */
const SHELL_METACHARACTERS = /[|&;<>$`]/u;

/** A capitalised ordinary word: `Open`, `Verify`. Not `MyTool`, not `Xvfb2`. */
const CAPITALISED_WORD = /^[A-Z][a-z]+$/u;

/**
 * Any one of these settles the question in favour of "runnable", and they are
 * checked FIRST.
 *
 * The asymmetry is deliberate. Calling a real command prose would suppress a
 * check that would have run — silently reducing the evidence behind a pass,
 * which is the exact failure this whole module exists to remove. Calling prose
 * a command merely reproduces today's behaviour. So every signal that a human
 * wrote a command line wins outright, and the sentence test only ever speaks
 * where none of them fired.
 */
function hasExecutableSignal(command: string): boolean {
  const tokens = command.split(/\s+/u).filter((token) => token.length > 0);
  const first = tokens[0] ?? "";

  return (
    tokens.length <= 1 ||
    SHELL_METACHARACTERS.test(command) ||
    KNOWN_RUNNERS.has(first) ||
    first.includes("/") ||
    first.includes("\\") ||
    first.includes(".") ||
    // A flag. English sentences do not contain `-v` or `--watch` as a word,
    // and this is what keeps `Xvfb -screen 0 1280x1024x24` runnable.
    tokens.slice(1).some((token) => /^-{1,2}[A-Za-z0-9]/u.test(token))
  );
}

function sentenceWords(command: string): readonly string[] {
  return command
    .split(/\s+/u)
    .map((token) => token.replace(/^["'(]+|[."',:;)]+$/gu, "").toLowerCase())
    .filter((token) => FUNCTION_WORDS.has(token));
}

export function classifyValidationCommand(command: string): ValidationCommandClassification {
  const trimmed = command.trim();

  if (isPlaceholderText(trimmed)) {
    return {
      command: trimmed,
      kind: "placeholder",
      reason: `it is still a placeholder — ${placeholderReason(trimmed)}`
    };
  }

  if (hasExecutableSignal(trimmed)) {
    return { command: trimmed, kind: "executable", reason: null };
  }

  const tokens = trimmed.split(/\s+/u);
  const words = sentenceWords(trimmed);

  if (words.length > 0) {
    return {
      command: trimmed,
      kind: "prose",
      reason:
        `it reads as a sentence, not a command — the word${words.length > 1 ? "s" : ""} ` +
        `${words.map((word) => `"${word}"`).join(", ")} would be passed to the shell as ` +
        `argument${words.length > 1 ? "s" : ""}`
    };
  }

  if (tokens.length >= 3 && CAPITALISED_WORD.test(tokens[0] ?? "")) {
    return {
      command: trimmed,
      kind: "prose",
      reason:
        `it reads as a sentence, not a command — "${tokens[0]}" is an ordinary capitalised ` +
        `word, and the shell would look for a program by that name`
    };
  }

  return { command: trimmed, kind: "executable", reason: null };
}

export type ValidationCommandPartition = {
  /** Entries that will be executed. */
  readonly executable: readonly string[];
  /** Entries that will NOT be executed, and why. */
  readonly rejected: readonly ValidationCommandClassification[];
};

export function partitionValidationCommands(
  commands: readonly string[]
): ValidationCommandPartition {
  const classified = commands
    .map((command) => command.trim())
    .filter((command) => command.length > 0)
    .map(classifyValidationCommand);

  return {
    executable: classified
      .filter((entry) => entry.kind === "executable")
      .map((entry) => entry.command),
    rejected: classified.filter((entry) => entry.kind !== "executable")
  };
}

/** One line per unrunnable entry, naming the entry and the repair. */
export function rejectedCommandMessages(
  rejected: readonly ValidationCommandClassification[]
): readonly string[] {
  return rejected.map(
    (entry) =>
      `Validation command "${entry.command}" was not executed because ${entry.reason}. ` +
      `Replace it with a command a shell can run, or record the manual check in the task ` +
      `description and add an automated check that proves the same thing.`
  );
}
