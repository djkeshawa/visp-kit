import { type BudgetMode } from "../artifacts/schemas/common.schema.js";
import { type BudgetUsageStatus } from "../artifacts/schemas/budget.schema.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { type TaskBudgetEstimate } from "./budget-report.js";

export type BudgetSummary = {
  readonly success: boolean;
  readonly targetPath: string;
  readonly feature: {
    readonly id: string;
    readonly slug: string;
  };
  readonly taskId?: string;
  readonly budgetMode: BudgetMode;
  readonly tasks: readonly TaskBudgetEstimate[];
  readonly totals: {
    readonly estimatedInputTokens: number;
    readonly expectedOutputTokens: number;
    readonly estimatedTotalTokens: number;
    readonly actualInputTokens: number | null;
    readonly actualOutputTokens: number | null;
    readonly actualTotalTokens: number | null;
    readonly actualUsageStatus: BudgetUsageStatus;
    readonly overBudgetTaskCount: number;
  };
  readonly estimatedTokens?: {
    readonly input: number;
    readonly expectedOutput: number;
    readonly total: number;
    readonly maxInput: number;
  };
  readonly overBudget?: boolean;
  readonly recommendation?: string;
  readonly writtenFiles: readonly string[];
  readonly dryRun: boolean;
  readonly warnings: readonly string[];
};

export function createBudgetSummary(input: {
  readonly targetPath: string;
  readonly feature: BudgetSummary["feature"];
  readonly taskId?: string;
  readonly budgetMode: BudgetMode;
  readonly tasks: readonly TaskBudgetEstimate[];
  readonly writtenFiles: readonly string[];
  readonly dryRun: boolean;
  readonly warnings: readonly string[];
}): BudgetSummary {
  const totals = {
    estimatedInputTokens: input.tasks.reduce((sum, task) => sum + task.estimatedInputTokens, 0),
    expectedOutputTokens: input.tasks.reduce((sum, task) => sum + task.expectedOutputTokens, 0),
    estimatedTotalTokens: input.tasks.reduce((sum, task) => sum + task.estimatedTotalTokens, 0),
    actualInputTokens: input.tasks.some((task) => typeof task.actualInputTokens === "number")
      ? input.tasks.reduce((sum, task) => sum + (task.actualInputTokens ?? 0), 0)
      : null,
    actualOutputTokens: input.tasks.some((task) => typeof task.actualOutputTokens === "number")
      ? input.tasks.reduce((sum, task) => sum + (task.actualOutputTokens ?? 0), 0)
      : null,
    actualTotalTokens: input.tasks.some((task) => typeof task.actualTotalTokens === "number")
      ? input.tasks.reduce((sum, task) => sum + (task.actualTotalTokens ?? 0), 0)
      : null,
    actualUsageStatus: input.tasks.some((task) => task.actualUsageStatus === "recorded")
      ? ("recorded" as const)
      : input.tasks.some((task) => task.actualUsageStatus === "unavailable")
        ? ("unavailable" as const)
        : ("not_recorded" as const),
    overBudgetTaskCount: input.tasks.filter((task) => task.overBudget).length
  };
  const selected =
    input.taskId === undefined
      ? undefined
      : input.tasks.find((task) => task.taskId === input.taskId);

  return {
    success: true,
    targetPath: input.targetPath,
    feature: input.feature,
    taskId: input.taskId,
    budgetMode: input.budgetMode,
    tasks: input.tasks,
    totals,
    estimatedTokens:
      selected === undefined
        ? undefined
        : {
            input: selected.estimatedInputTokens,
            expectedOutput: selected.expectedOutputTokens,
            total: selected.estimatedTotalTokens,
            maxInput: selected.maxInputTokens
          },
    overBudget: selected?.overBudget,
    recommendation: selected?.recommendation,
    writtenFiles: input.writtenFiles,
    dryRun: input.dryRun,
    warnings: input.warnings
  };
}

export function formatBudgetSummary(summary: BudgetSummary): string {
  const lines = [
    formatHeader("Visp budget estimate."),
    "",
    formatKeyValue("Feature", `${summary.feature.id}-${summary.feature.slug}`),
    formatKeyValue("Budget", summary.budgetMode),
    "",
    formatKeyValue("Tasks", String(summary.tasks.length)),
    formatKeyValue("Estimated input tokens", String(summary.totals.estimatedInputTokens)),
    formatKeyValue("Estimated total tokens", String(summary.totals.estimatedTotalTokens)),
    formatKeyValue("Actual usage", summary.totals.actualUsageStatus),
    formatKeyValue(
      "Actual input tokens",
      summary.totals.actualInputTokens === null
        ? summary.totals.actualUsageStatus === "unavailable"
          ? "unavailable"
          : "not recorded"
        : String(summary.totals.actualInputTokens)
    ),
    formatKeyValue(
      "Actual total tokens",
      summary.totals.actualTotalTokens === null
        ? summary.totals.actualUsageStatus === "unavailable"
          ? "unavailable"
          : "not recorded"
        : String(summary.totals.actualTotalTokens)
    ),
    formatKeyValue("Over-budget tasks", String(summary.totals.overBudgetTaskCount))
  ];

  if (summary.writtenFiles.length > 0) {
    lines.push("", "Written:", ...summary.writtenFiles.map((file) => `  ${file}`));
  }

  if (summary.warnings.length > 0) {
    lines.push("", "Warnings:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  const overBudget = summary.tasks.filter((task) => task.overBudget);

  if (overBudget.length > 0) {
    lines.push(
      "",
      "Recommendations:",
      ...overBudget.map((task) => `  ${task.taskId} is over budget. ${task.recommendation}`)
    );
  }

  lines.push("", "Next:", "  visp context --next");

  return `${lines.join("\n")}\n`;
}
