import { type BudgetMode } from "../artifacts/schemas/common.schema.js";

export type TaskBudgetEstimate = {
  readonly taskId: string;
  readonly estimatedInputTokens: number;
  readonly expectedOutputTokens: number;
  readonly estimatedTotalTokens: number;
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

export function renderBudgetReport(report: BudgetReportModel): string {
  const rows = report.tasks
    .map(
      (task) =>
        `| ${task.taskId} | ${task.estimatedInputTokens} | ${task.maxInputTokens} | ${task.overBudget ? "yes" : "no"} | ${task.recommendation} |`
    )
    .join("\n");
  const totalInput = report.tasks.reduce(
    (sum, task) => sum + task.estimatedInputTokens,
    0
  );
  const totalOutput = report.tasks.reduce(
    (sum, task) => sum + task.expectedOutputTokens,
    0
  );
  const overBudget = report.tasks.filter((task) => task.overBudget);

  return `# Visp Budget Report

Generated: ${report.generatedAt}

## Feature

- ID: ${report.feature.id}
- Slug: ${report.feature.slug}
- Title: ${report.feature.title}
- Budget mode: ${report.budgetMode}

## Summary

| Task | Estimated Input | Max Input | Over Budget | Recommendation |
|------|-----------------|-----------|-------------|----------------|
${rows || "| None | 0 | 0 | no | No tasks found. |"}

## Totals

- Estimated input tokens: ${totalInput}
- Estimated expected output tokens: ${totalOutput}
- Estimated total tokens: ${totalInput + totalOutput}
- Over-budget tasks: ${overBudget.length}

## Cache Usage Notes

${report.warnings.length === 0 ? "- No cache warnings." : report.warnings.map((warning) => `- ${warning}`).join("\n")}

## Recommendations

- Add allowedFiles to tasks missing file scope.
- Run visp scan if file summaries are missing.
- Use visp context T001 --budget lean for low-risk tasks.
- Split tasks that exceed budget.
- Avoid full-file context unless needed.
`;
}
