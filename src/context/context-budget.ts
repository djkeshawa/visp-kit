import { type BudgetMode } from "../artifacts/schemas/common.schema.js";

export type DependencyTaskContextLevel = "compact" | "moderate";
export type PlanDetailLevel = "linked-only" | "linked-plus-modules" | "detailed";
export type ContextOutputStyle = "compact" | "normal" | "detailed";

export type ContextBudgetPolicy = {
  readonly mode: BudgetMode;
  readonly maxInputTokens: number;
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

const policies: Record<BudgetMode, ContextBudgetPolicy> = {
  lean: {
    mode: "lean",
    maxInputTokens: 8000,
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
  maxTokensOverride?: number
): ContextBudgetPolicy {
  const policy = policies[mode];

  if (maxTokensOverride === undefined) {
    return policy;
  }

  return {
    ...policy,
    maxInputTokens: maxTokensOverride
  };
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
