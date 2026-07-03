import { type BudgetMode } from "../artifacts/schemas/common.schema.js";
import { type BudgetUsageStatus } from "../artifacts/schemas/budget.schema.js";

export type TaskBudgetEstimate = {
  readonly taskId: string;
  readonly estimatedInputTokens: number;
  readonly expectedOutputTokens: number;
  readonly estimatedTotalTokens: number;
  readonly actualUsageStatus: BudgetUsageStatus;
  readonly actualInputTokens?: number | null;
  readonly actualOutputTokens?: number | null;
  readonly actualTotalTokens?: number | null;
  readonly actualUsageRecordedAt?: string;
  readonly actualUsageSource?: string;
  readonly actualUsageModel?: string;
  readonly actualUsageNote?: string;
  readonly maxInputTokens: number;
  readonly overBudget: boolean;
  readonly recommendation: string;
};

export type BudgetReportModel = {
  readonly generatedAt: string;
  readonly feature: {
    readonly id: string;
    readonly slug: string;
    readonly title: string;
  };
  readonly budgetMode: BudgetMode;
  readonly tasks: readonly TaskBudgetEstimate[];
  readonly warnings: readonly string[];
};

function actualValue(value: number | null | undefined, status: BudgetUsageStatus): string | number {
  if (status === "unavailable") return "unavailable";
  if (status === "estimated_only") return "estimated only";
  return value ?? "not recorded";
}

function usageStatus(task: TaskBudgetEstimate): BudgetUsageStatus {
  return task.actualUsageStatus;
}

export function renderBudgetReport(report: BudgetReportModel): string {
  const rows = report.tasks
    .map(
      (task) =>
        `| ${task.taskId} | ${task.estimatedInputTokens} | ${actualValue(task.actualInputTokens, usageStatus(task))} | ${actualValue(task.actualOutputTokens, usageStatus(task))} | ${actualValue(task.actualTotalTokens, usageStatus(task))} | ${task.maxInputTokens} | ${task.overBudget ? "yes" : "no"} | ${task.recommendation} |`
    )
    .join("\n");
  const totalInput = report.tasks.reduce((sum, task) => sum + task.estimatedInputTokens, 0);
  const totalOutput = report.tasks.reduce((sum, task) => sum + task.expectedOutputTokens, 0);
  const overBudget = report.tasks.filter((task) => task.overBudget);
  const actualUsage = report.tasks.filter((task) => task.actualUsageStatus !== "not_recorded");
  const numericUsage = actualUsage.filter(
    (task) =>
      task.actualUsageStatus === "recorded" &&
      task.actualTotalTokens !== undefined &&
      task.actualTotalTokens !== null
  );
  const actualInput = actualUsage.reduce((sum, task) => sum + (task.actualInputTokens ?? 0), 0);
  const actualOutput = actualUsage.reduce((sum, task) => sum + (task.actualOutputTokens ?? 0), 0);
  const actualTotal = actualUsage.reduce((sum, task) => sum + (task.actualTotalTokens ?? 0), 0);
  const usageRows = actualUsage
    .map(
      (task) =>
        `| ${task.taskId} | ${actualValue(task.actualInputTokens, usageStatus(task))} | ${actualValue(task.actualOutputTokens, usageStatus(task))} | ${actualValue(task.actualTotalTokens, usageStatus(task))} | ${task.actualUsageSource ?? "unknown"} | ${task.actualUsageModel ?? "not recorded"} | ${task.actualUsageRecordedAt ?? "unknown"} | ${task.actualUsageNote ?? ""} |`
    )
    .join("\n");

  return `# Visp Budget Report

Generated: ${report.generatedAt}

## Feature

- ID: ${report.feature.id}
- Slug: ${report.feature.slug}
- Title: ${report.feature.title}
- Budget mode: ${report.budgetMode}

## Summary

| Task | Estimated Input | Actual Input | Actual Output | Actual Total | Max Input | Over Budget | Recommendation |
|------|-----------------|--------------|---------------|--------------|-----------|-------------|----------------|
${rows || "| None | 0 | not recorded | not recorded | not recorded | 0 | no | No tasks found. |"}

## Totals

- Estimated input tokens: ${totalInput}
- Estimated expected output tokens: ${totalOutput}
- Estimated total tokens: ${totalInput + totalOutput}
- Actual input tokens: ${actualUsage.length === 0 ? "not recorded" : numericUsage.length === 0 ? "unavailable" : actualInput}
- Actual output tokens: ${actualUsage.length === 0 ? "not recorded" : numericUsage.length === 0 ? "unavailable" : actualOutput}
- Actual total tokens: ${actualUsage.length === 0 ? "not recorded" : numericUsage.length === 0 ? "unavailable" : actualTotal}
- Over-budget tasks: ${overBudget.length}

## Actual Usage

| Task | Actual Input | Actual Output | Actual Total | Source | Model | Recorded | Note |
|------|--------------|---------------|--------------|--------|-------|----------|------|
${usageRows || "| None | not recorded | not recorded | not recorded | none | none | none | Actual usage is unknown until an agent or user records it. |"}

## Cache Usage Notes

${report.warnings.length === 0 ? "- No cache warnings." : report.warnings.map((warning) => `- ${warning}`).join("\n")}

## Recommendations

- Add allowedFiles to tasks missing file scope.
- Run visp scan if file summaries are missing.
- Use visp context T001 --budget lean for low-risk tasks.
- Record actual usage after implementation, or record usage as unavailable when the agent surface does not expose token counts.
- Split tasks that exceed budget.
- Avoid full-file context unless needed.
`;
}
