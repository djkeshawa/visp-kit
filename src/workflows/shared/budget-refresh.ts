import { runBudgetWorkflow } from "../budget.workflow.js";

export type BudgetRefreshResult = {
  readonly writtenFiles: readonly string[];
  readonly warnings: readonly string[];
};

export async function refreshBudgetReport(input: {
  readonly targetPath: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly dryRun: boolean;
  readonly now: string;
}): Promise<BudgetRefreshResult> {
  if (input.dryRun) {
    return { writtenFiles: [], warnings: [] };
  }

  const result = await runBudgetWorkflow({
    targetPath: input.targetPath,
    feature: input.feature,
    taskId: input.taskId,
    writeReport: true,
    dryRun: false,
    refreshTimeline: false,
    recordRun: false,
    now: input.now
  });

  if (!result.ok) {
    return {
      writtenFiles: [],
      warnings: [`Budget report refresh skipped: ${result.error.message}`]
    };
  }

  return {
    writtenFiles: result.value.writtenFiles,
    warnings: result.value.warnings
  };
}
