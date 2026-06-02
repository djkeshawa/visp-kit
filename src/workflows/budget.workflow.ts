import path from "node:path";

import {
  budgetReportArtifactPath,
  taskGraphArtifactPath
} from "../artifacts/artifact-paths.js";
import { type BudgetMode } from "../artifacts/schemas/common.schema.js";
import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { VispError } from "../core/errors.js";
import { pathExists, writeTextFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import {
  renderBudgetReport,
  type BudgetReportModel,
  type TaskBudgetEstimate
} from "../budget/budget-report.js";
import {
  createBudgetSummary,
  type BudgetSummary
} from "../budget/budget-summary.js";
import { compileContext } from "../context/context-compiler.js";
import { selectTaskById } from "../context/task-selector.js";
import { resolveActiveFeature, type ActiveFeature } from "./shared/active-feature.js";
import { loadTaskGraph } from "./shared/task-graph-loader.js";

export type BudgetWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly budget?: BudgetMode;
  readonly maxTokens?: number;
  readonly writeReport?: boolean;
  readonly dryRun?: boolean;
  readonly now?: string;
};

async function ensureTaskGraph(input: {
  readonly targetPath: string;
  readonly featureKey: string;
}): Promise<Result<void, VispError>> {
  const exists = await pathExists(taskGraphArtifactPath(input.targetPath, input.featureKey));

  if (!exists.ok) return exists;
  if (!exists.value) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Task graph is missing. Run `visp tasks` first."
      )
    );
  }

  return ok(undefined);
}

async function estimateTask(input: {
  readonly targetPath: string;
  readonly feature: ActiveFeature;
  readonly taskGraph: TaskGraphArtifact;
  readonly task: Task;
  readonly budget?: BudgetMode;
  readonly maxTokens?: number;
  readonly now: string;
  readonly warnings: string[];
}): Promise<Result<TaskBudgetEstimate, VispError>> {
  const compiled = await compileContext({
    targetPath: input.targetPath,
    feature: input.feature,
    taskGraph: input.taskGraph,
    task: input.task,
    budgetMode: input.budget,
    maxTokens: input.maxTokens,
    now: input.now
  });

  if (!compiled.ok) return compiled;

  input.warnings.push(...compiled.value.warnings);

  return ok({
    taskId: input.task.id,
    estimatedInputTokens: compiled.value.pack.estimatedTokens.input,
    expectedOutputTokens: compiled.value.pack.estimatedTokens.expectedOutput,
    estimatedTotalTokens: compiled.value.pack.estimatedTokens.total,
    maxInputTokens: compiled.value.pack.estimatedTokens.maxInput,
    overBudget: compiled.value.pack.overBudget,
    recommendation: compiled.value.pack.recommendation
  });
}

function reportModel(input: {
  readonly now: string;
  readonly feature: {
    readonly id: string;
    readonly slug: string;
    readonly title: string;
  };
  readonly budgetMode: BudgetMode;
  readonly tasks: readonly TaskBudgetEstimate[];
  readonly warnings: readonly string[];
}): BudgetReportModel {
  return {
    generatedAt: input.now,
    feature: input.feature,
    budgetMode: input.budgetMode,
    tasks: input.tasks,
    warnings: input.warnings
  };
}

export async function runBudgetWorkflow(
  options: BudgetWorkflowOptions = {}
): Promise<Result<BudgetSummary, VispError>> {
  const cwd = options.cwd ?? process.cwd();
  const targetPath = path.resolve(cwd, options.targetPath ?? ".");
  const dryRun = options.dryRun ?? false;
  const now = options.now ?? new Date().toISOString();
  const warnings: string[] = [];
  const feature = await resolveActiveFeature({
    targetPath,
    feature: options.feature
  });

  if (!feature.ok) return feature;

  const graphExists = await ensureTaskGraph({
    targetPath,
    featureKey: feature.value.key
  });

  if (!graphExists.ok) return graphExists;

  const taskGraph = await loadTaskGraph({
    targetPath,
    featureKey: feature.value.key
  });

  if (!taskGraph.ok) return taskGraph;

  const tasks =
    options.taskId === undefined
      ? taskGraph.value.tasks
      : (() => {
          const selected = selectTaskById(taskGraph.value, options.taskId);
          return selected.ok ? [selected.value] : selected;
        })();

  if (!Array.isArray(tasks)) {
    return tasks;
  }

  const estimates: TaskBudgetEstimate[] = [];

  for (const task of tasks) {
    const estimate = await estimateTask({
      targetPath,
      feature: feature.value,
      taskGraph: taskGraph.value,
      task,
      budget: options.budget,
      maxTokens: options.maxTokens,
      now,
      warnings
    });

    if (!estimate.ok) return estimate;

    estimates.push(estimate.value);
  }

  const budgetMode =
    options.budget ??
    feature.value.intent.budgetMode ??
    "lean";
  const writtenFiles: string[] = [];

  if (options.writeReport) {
    const reportPath = budgetReportArtifactPath(targetPath);
    const report = renderBudgetReport(
      reportModel({
        now,
        feature: {
          id: feature.value.id,
          slug: feature.value.slug,
          title: feature.value.intent.title
        },
        budgetMode,
        tasks: estimates,
        warnings
      })
    );

    if (!dryRun) {
      const write = await writeTextFile(reportPath, report);

      if (!write.ok) return write;
    }

    writtenFiles.push(relativePath(targetPath, reportPath));
  }

  return ok(
    createBudgetSummary({
      targetPath,
      feature: {
        id: feature.value.id,
        slug: feature.value.slug
      },
      taskId: options.taskId,
      budgetMode,
      tasks: estimates,
      writtenFiles: dryRun ? [] : writtenFiles,
      dryRun,
      warnings: [...new Set(warnings)]
    })
  );
}
