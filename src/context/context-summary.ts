import { type BudgetMode } from "../artifacts/schemas/common.schema.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { type WorkflowFileAction } from "../workflows/shared/generated-files.js";

export type ContextSummary = {
  readonly success: boolean;
  readonly targetPath: string;
  readonly feature: {
    readonly id: string;
    readonly slug: string;
    readonly path: string;
  };
  readonly taskId: string;
  readonly budgetMode: BudgetMode;
  readonly estimatedTokens: {
    readonly input: number;
    readonly expectedOutput: number;
    readonly total: number;
    readonly maxInput: number;
  };
  readonly overBudget: boolean;
  readonly recommendation: string;
  readonly createdFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly overwrittenFiles: readonly string[];
  readonly updatedFiles: readonly string[];
  readonly writtenFiles: readonly string[];
  readonly promptOnly: boolean;
  readonly dryRun: boolean;
  readonly warnings: readonly string[];
  readonly nextCommand: string;
};

export function createContextSummary(input: {
  readonly targetPath: string;
  readonly feature: ContextSummary["feature"];
  readonly taskId: string;
  readonly budgetMode: BudgetMode;
  readonly estimatedTokens: ContextSummary["estimatedTokens"];
  readonly overBudget: boolean;
  readonly recommendation: string;
  readonly actions: readonly WorkflowFileAction[];
  readonly promptOnly: boolean;
  readonly dryRun: boolean;
  readonly warnings: readonly string[];
}): ContextSummary {
  return {
    success: true,
    targetPath: input.targetPath,
    feature: input.feature,
    taskId: input.taskId,
    budgetMode: input.budgetMode,
    estimatedTokens: input.estimatedTokens,
    overBudget: input.overBudget,
    recommendation: input.recommendation,
    createdFiles: input.actions
      .filter((action) => action.action === "created")
      .map((action) => action.path),
    skippedFiles: input.actions
      .filter((action) => action.action === "skipped")
      .map((action) => action.path),
    overwrittenFiles: input.actions
      .filter((action) => action.action === "overwritten")
      .map((action) => action.path),
    updatedFiles: input.actions
      .filter((action) => action.action === "updated")
      .map((action) => action.path),
    writtenFiles: input.actions
      .filter((action) => action.action !== "skipped")
      .map((action) => action.path),
    promptOnly: input.promptOnly,
    dryRun: input.dryRun,
    warnings: input.warnings,
    nextCommand: "Use .visp/prompts/current-task.prompt.md with Codex"
  };
}

export function formatContextSummary(summary: ContextSummary): string {
  const lines = [
    formatHeader(summary.dryRun ? "Visp context dry run." : "Visp context ready."),
    "",
    formatKeyValue("Feature", `${summary.feature.id}-${summary.feature.slug}`),
    formatKeyValue("Task", summary.taskId),
    formatKeyValue("Budget", summary.budgetMode),
    formatKeyValue("Estimated input tokens", String(summary.estimatedTokens.input)),
    formatKeyValue("Max input tokens", String(summary.estimatedTokens.maxInput)),
    formatKeyValue("Over budget", summary.overBudget ? "yes" : "no"),
    formatKeyValue("Recommendation", summary.recommendation)
  ];

  if (summary.createdFiles.length > 0) {
    lines.push("", "Created:", ...summary.createdFiles.map((file) => `  ${file}`));
  }

  if (summary.overwrittenFiles.length > 0) {
    lines.push("", "Overwritten:", ...summary.overwrittenFiles.map((file) => `  ${file}`));
  }

  if (summary.skippedFiles.length > 0) {
    lines.push("", "Skipped:", ...summary.skippedFiles.map((file) => `  ${file}`));
  }

  if (summary.updatedFiles.length > 0) {
    lines.push("", "Updated:", ...summary.updatedFiles.map((file) => `  ${file}`));
  }

  if (summary.warnings.length > 0) {
    lines.push("", "Warnings:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  lines.push("", "Next:", `  ${summary.nextCommand}`);

  return `${lines.join("\n")}\n`;
}
