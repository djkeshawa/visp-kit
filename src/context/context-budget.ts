import { type BudgetMode } from "../artifacts/schemas/common.schema.js";

export type DependencyTaskContextLevel = "compact" | "moderate";
export type PlanDetailLevel = "linked-only" | "linked-plus-modules" | "detailed";
export type ContextOutputStyle = "compact" | "normal" | "detailed";

export type ContextBudgetPolicy = {
  readonly mode: BudgetMode;
  readonly maxInputTokens: number;
  /**
   * Tolerance percent applied on top of `maxInputTokens` when deciding whether
   * a context pack is over budget. The effective over-budget threshold is
   * `maxInputTokens * (1 + overBudgetTolerancePercent / 100)`. Sourced from
   * policy `limits.maxContextOverBudgetPercent`; locked mode is 0 (a hard
   * cutoff, identical to the historical behavior).
   */
  readonly overBudgetTolerancePercent: number;
  /**
   * Whether the compact snippet cap applies to this pack.
   *
   * The cap is `COMPACT_MAX_SNIPPET_FILES` files at `COMPACT_MAX_SNIPPET_LINES`
   * lines each, in `context-selector.ts`. Until this field existed the cap was
   * reachable ONLY through an understanding case — `onPath === undefined` sent
   * `allocateSnippets` down the branch that gives every candidate an uncapped
   * snippet — so there was no configuration of a shipped binary in which the
   * cap fired and the graph did not, and the thing that was measured could not
   * be run by a user.
   *
   * `maxFiles` and `maxSnippetTokensPerFile` are deliberately still not
   * settable from outside: they are per-mode budget shape, and the measured
   * result is about the cap, not about them.
   */
  readonly compactSnippetCap: boolean;
  readonly maxFiles: number;
  readonly maxSnippetTokensPerFile: number;
  readonly maxFullFileTokens: number;
  readonly includeProjectSummary: boolean;
  readonly includePatterns: boolean;
  readonly includeDependencyTaskContext: DependencyTaskContextLevel;
  readonly includePlanDetails: PlanDetailLevel;
  readonly includeFullFilesByDefault: boolean;
  readonly outputStyle: ContextOutputStyle;
  readonly expectedOutputTokens: number;
};

/**
 * Effective over-budget threshold in input tokens after applying the policy
 * tolerance. `overBudget` is `estimatedInputTokens > effectiveMaxInputTokens`.
 * With a 0% tolerance (locked mode) this equals `maxInputTokens`, preserving
 * the historical hard cutoff exactly.
 */
export function effectiveMaxInputTokens(policy: ContextBudgetPolicy): number {
  const tolerance = Math.max(0, policy.overBudgetTolerancePercent);
  return Math.floor(policy.maxInputTokens * (1 + tolerance / 100));
}

/**
 * The compact snippet cap is ON by default, in every budget mode, and this is
 * the argument for that.
 *
 * MEASURED, on 21 capability-eligible tasks in `balanced` mode, cap versus no
 * cap with no graph, no store and no understanding case on either side, AGAINST
 * THE SHIPPED BINARY (`develop` 56ff1af — arm A is `--snippet-cap off`, arm F
 * takes this default, and each arm records the `snippetCapApplied` Kit reported):
 *
 *   - input tokens 14,539.048 -> 7,343.333, which is -49.49% — the same file
 *     list for half the tokens, NOT the same information (see below);
 *   - bodied file recall 0.4382395382 on both sides — the same floating-point
 *     number on the cohort AND on every task individually. Recall fell on
 *     zero tasks. So did listed recall, bodied precision and files bodied;
 *     note that bodied recall is not an independent second metric here — the
 *     harness marks a file bodied when its entry carries a non-empty summary
 *     and Kit summarises every file it lists, so bodied recall is
 *     arithmetically identical to listed recall. "Bit-identical bodied recall"
 *     therefore means only that the capped pack NAMES THE SAME FILES; the cap
 *     still cuts source text from a full snippet per listed file to at most
 *     four files at forty lines;
 *   - symbol recall 0.6333333 on both sides.
 *
 * DO NOT READ THAT LAST ROW AS THE CAP BEING FREE. On the 28-record cohort the
 * cap cost symbol recall (0.6288 -> 0.6141), all of it 2 tasks in
 * `mongo-exporter`. Those are among the seven records the 21-record cohort
 * drops, so the cost did not fall — the cases that paid it left. A figure that
 * improves because its failures were removed has not improved.
 *
 * A default is a claim about which failure is worse. The uncapped default
 * produces a pack that exceeds the ceiling its own mode declares on 15 of 28
 * tasks (that count has not been re-aggregated on 21 and is quoted as the
 * 28-record figure it is), and the recommendation it then prints is "split the
 * task" — the tool blaming the user for its own retrieval. Against that, the
 * cap costs nothing on the metric that decides whether the file the human
 * patched is in the pack at all, and where it does cost symbol recall it costs
 * nothing new: arm D, the full intel pipeline, pays exactly this price for
 * exactly this reason.
 *
 * NOT -52.01%, AND NOT -51.08%. Two superseded pairs for the same finding.
 * 16,709.6 -> 8,019.4 (-52.01%) came from a visp-dev measurement build; neither
 * endpoint is producible on the build that ships this default, and re-running
 * the same two arms on shipped Kit adds a flat ~292 tokens to BOTH arms (pack
 * bookkeeping, not a cap effect) plus 0-7 on the capped arm (the snippet reason
 * string). 17,002.071 -> 8,317.000 (-51.08%) is this same shipped-binary
 * measurement on the 28-record cohort, before seven records whose contamination
 * prose contradicted their own `provenance.author` were reclassified as
 * author-dependent. No arm was re-run for -49.49%; the committed rows were
 * re-aggregated. The finding did not move, the denominator did. See
 * `docs/token-efficiency.md` and
 * `visp-dev/evidence/phase-24/cohort-21-restatement.json`.
 *
 * WHAT THIS DEFAULT IS NOT. The run above was on two repositories (one of which
 * now contributes only regression records), in `balanced` mode only — and Kit
 * ships this cap on in all three budget modes. It is not measured outside
 * `balanced`, and it is not measured outside those two repositories; the same
 * constant in `lean` and `strict` is an extrapolation and is written here as
 * one. A per-mode default
 * would be a second, unmeasured claim (that `strict` users want the uncapped
 * shape) on top of the first, so the default is uniform and the escape is
 * explicit: `--snippet-cap off`, or `contextSnippetCap: false` in
 * `.visp/config.json`, restores the previous behaviour exactly.
 */
const DEFAULT_COMPACT_SNIPPET_CAP = true;

const policies: Record<BudgetMode, ContextBudgetPolicy> = {
  lean: {
    mode: "lean",
    maxInputTokens: 8000,
    overBudgetTolerancePercent: 0,
    compactSnippetCap: DEFAULT_COMPACT_SNIPPET_CAP,
    maxFiles: 6,
    maxSnippetTokensPerFile: 600,
    maxFullFileTokens: 1200,
    includeProjectSummary: true,
    includePatterns: false,
    includeDependencyTaskContext: "compact",
    includePlanDetails: "linked-only",
    includeFullFilesByDefault: false,
    outputStyle: "compact",
    expectedOutputTokens: 1500
  },
  balanced: {
    mode: "balanced",
    maxInputTokens: 15000,
    overBudgetTolerancePercent: 0,
    compactSnippetCap: DEFAULT_COMPACT_SNIPPET_CAP,
    maxFiles: 12,
    maxSnippetTokensPerFile: 1000,
    maxFullFileTokens: 2500,
    includeProjectSummary: true,
    includePatterns: true,
    includeDependencyTaskContext: "compact",
    includePlanDetails: "linked-plus-modules",
    includeFullFilesByDefault: false,
    outputStyle: "normal",
    expectedOutputTokens: 2500
  },
  strict: {
    mode: "strict",
    maxInputTokens: 30000,
    overBudgetTolerancePercent: 0,
    compactSnippetCap: DEFAULT_COMPACT_SNIPPET_CAP,
    maxFiles: 20,
    maxSnippetTokensPerFile: 1800,
    maxFullFileTokens: 5000,
    includeProjectSummary: true,
    includePatterns: true,
    includeDependencyTaskContext: "moderate",
    includePlanDetails: "detailed",
    includeFullFilesByDefault: false,
    outputStyle: "detailed",
    expectedOutputTokens: 4000
  }
};

export function contextBudgetPolicy(
  mode: BudgetMode,
  maxTokensOverride?: number,
  overBudgetTolerancePercent?: number,
  compactSnippetCapOverride?: boolean
): ContextBudgetPolicy {
  const base = policies[mode];
  const policy: ContextBudgetPolicy = {
    ...base,
    maxInputTokens: maxTokensOverride ?? base.maxInputTokens,
    overBudgetTolerancePercent: overBudgetTolerancePercent ?? base.overBudgetTolerancePercent,
    compactSnippetCap: compactSnippetCapOverride ?? base.compactSnippetCap
  };

  return policy;
}

/** The compact snippet cap's default, for callers that resolve it themselves. */
export function defaultCompactSnippetCap(mode: BudgetMode): boolean {
  return policies[mode].compactSnippetCap;
}

export function contextBudgetRecommendation(input: {
  readonly overBudget: boolean;
  readonly overBudgetBy: number;
  readonly hasAllowedFiles: boolean;
  readonly includeFullFiles: boolean;
}): string {
  if (!input.overBudget) {
    return "OK";
  }

  if (input.includeFullFiles) {
    return "Remove full-file context or lower included files.";
  }

  if (!input.hasAllowedFiles) {
    return "Add allowedFiles to the task or split the task.";
  }

  if (input.overBudgetBy > 4000) {
    return "Split the task or reduce selected files.";
  }

  return "Reduce snippets or use a smaller task scope.";
}
