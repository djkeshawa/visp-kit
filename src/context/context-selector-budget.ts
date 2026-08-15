/**
 * The fixed numbers a compact context pack is built to, and why each one is
 * what it is.
 *
 * These are budget decisions, not tuning knobs: a context pack has a token
 * ceiling, and every constant here is one place that ceiling gets spent. They
 * live in their own module because three selectors now read them, and a
 * constant that two callers disagree about is a budget that silently doubles.
 */
import {
  type ContextPack,
  type ContextUnderstanding
} from "../artifacts/schemas/context-pack.schema.js";

/**
 * Compact-pack budgets (ADR 0014 Q3), revised by the Phase 21 measurement.
 *
 * The first version of this made path membership a FILTER: a file the cited
 * path did not name lost its body. Measured over the 29 capability-eligible
 * holdout tasks that bought −66.1% tokens for −78.3% bodied file recall and
 * −80.3% symbol recall, because intel traces no path at all on 17 of those 29
 * and the selector inherited every miss as a dropped file.
 *
 * The objective was never minimum tokens; it is the best localisation per
 * token. So the revision splits a "body" by what it actually costs:
 *
 *   - a file SUMMARY (imports, exports, symbols, comments) is ~300 tokens and
 *     is what carries symbol recall;
 *   - a SNIPPET is up to `maxSnippetTokensPerFile` — 1,000 in `balanced` — and
 *     is where the pack's bulk always was.
 *
 * Every in-scope file therefore keeps its summary, and path membership decides
 * only who gets the expensive body. That makes the path a RANKING signal: it
 * can promote a file to a snippet, and it can no longer silence one.
 */
export const COMPACT_MAX_SNIPPET_FILES = 4;
export const COMPACT_MAX_SNIPPET_LINES = 40;
/**
 * Snippet slots the relevance ranking keeps even when the cited path could
 * fill every one of them.
 *
 * This is the floor that makes a thin path never worse than no path. Intel's
 * path covered 0.112 of the human patch across the holdout: a path is good
 * evidence about what it names and says nothing about what it does not, so it
 * may take slots and it may not take the pack.
 */
export const COMPACT_MIN_RELEVANCE_SNIPPET_FILES = 2;
/** Snippet slots the cited path may take. */
export const COMPACT_PATH_SNIPPET_BUDGET = Math.max(
  0,
  COMPACT_MAX_SNIPPET_FILES - COMPACT_MIN_RELEVANCE_SNIPPET_FILES
);
/**
 * Files the cited path names that the relevance ranking would not have
 * selected at all.
 *
 * They are ADDED, never substituted, so the bodied set in compact mode is a
 * superset of the set the same pack would carry with no case at all. That
 * monotonicity — more path information never removes a body — is the property
 * the Phase 21 defect broke, and it is asserted in the tests.
 *
 * The bound is the path's snippet budget, deliberately, and not a number of
 * its own: a file the ranking rejected is worth adding only if the path can
 * also afford to show its code. Adding more than that would be spending
 * summaries on files two independent signals scored low, which is the
 * "flood the pack with weakly-relevant files" failure the compact pack exists
 * to avoid.
 */
export const COMPACT_MAX_PATH_ONLY_FILES = COMPACT_PATH_SNIPPET_BUDGET;

/**
 * Structural admission (Phase 22), and why every number below is here rather
 * than in the artifact it reads.
 *
 * Intel states that `a.ts` imports `b.ts`. It does not state that `b.ts` is
 * worth 0.5, that 0.5 is enough to earn a place in a pack, or that two places
 * are what a task can afford. Those three are Kit's judgement about intel's
 * facts, they are visible in Kit's diff, and the day any of them arrives from
 * the artifact instead, intel is deciding.
 *
 * The shape is `orderByPathMembership`'s, on purpose. That shape is the
 * corrected form of the Phase 21 defect, and the properties it was corrected
 * into are the ones this must not break:
 *
 *  - ADDITIVE. Structure appends; it never displaces and never filters. The
 *    bodied set with a graph is a SUPERSET of the bodied set without one, so no
 *    graph fact can take a file's body away. A signal that can do that is
 *    deciding what the model may not see, and that is the one power that stays
 *    out.
 *  - FLOORED. Every one of the lexical ranking's `maxFiles` slots survives
 *    untouched. Text relevance earned 0.4831/0.4900 bodied recall on its own;
 *    structure is layered on top of it, not traded against it.
 *  - BOUNDED, AND CHEAPLY. Admitted files get a summary (~300 tokens) and never
 *    a snippet, so the whole mechanism costs at most ~600 tokens against a
 *    9,675-token mean. `allocateSnippets` and the trimmer do not see them.
 */
export const STRUCT_MAX_ADMITTED_FILES = 2;
/**
 * The proximity an admitted file must clear: hop 1 and hop 1 only.
 *
 * A hop-2 file is "something that talks to something the task touches", which
 * is a claim about the tree that is true of most of a codebase. It stays in the
 * map (it is a real fact) and it never buys a slot.
 */
export const STRUCT_MIN_ADMISSION_PROXIMITY = 0.5;
/**
 * How many lexical hits seed the expansion when the task declares no files.
 *
 * Three, because these seeds are UNMEASURED — nobody has recorded the precision
 * of the top-3 text hits on this cohort — and a wrong seed expands a wrong
 * neighbourhood. Three keeps the blast radius at the two files
 * `STRUCT_MAX_ADMITTED_FILES` already bounds, and makes seed precision a thing
 * a measurement can report before anything is bought with it.
 */
export const STRUCT_MAX_LEXICAL_SEEDS = 3;

/**
 * The cited path when nothing cites one.
 *
 * Not a fake case: it is the empty set of files an absent case names, which is
 * what it names. Every rule below that reads `onPath` reads it as evidence —
 * "was this file cited?" — and the answer for all of them, correctly, is no.
 */
export const EMPTY_PATH_SET: ReadonlySet<string> = new Set();

/**
 * Files the compact pack may show code for: those holding an entity on the
 * cited path or in the candidate change set.
 *
 * The membership decision upstream is by entity id; these are the file paths
 * those ids resolved to. A path is an identity within one snapshot of one
 * repository, which is the only reason it is safe to compare here.
 */
export function understandingFilePaths(understanding: ContextUnderstanding): ReadonlySet<string> {
  const paths = new Set<string>();
  const add = (filePath: string | null): void => {
    // Normalised on the way in, because every caller compares these against
    // scan's index, which is forward-slashed.
    if (filePath !== null) paths.add(filePath.replaceAll("\\", "/"));
  };

  for (const row of understanding.path) {
    add(row.sourceFilePath);
    add(row.targetFilePath);
  }

  for (const signature of understanding.signatures) {
    add(signature.filePath);
  }

  return paths;
}

export type FileContext = {
  readonly file: ContextPack["includedFiles"][number];
  readonly snippet?: ContextPack["includedSnippets"][number];
};
