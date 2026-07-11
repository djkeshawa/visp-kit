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

const policies: Record<BudgetMode, ContextBudgetPolicy> = {
  lean: {
    mode: "lean",
    maxInputTokens: 8000,
    overBudgetTolerancePercent: 0,
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
  overBudgetTolerancePercent?: number
): ContextBudgetPolicy {
  const base = policies[mode];
  const policy: ContextBudgetPolicy = {
    ...base,
    maxInputTokens: maxTokensOverride ?? base.maxInputTokens,
    overBudgetTolerancePercent:
      overBudgetTolerancePercent ?? base.overBudgetTolerancePercent
  };

  return policy;
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
