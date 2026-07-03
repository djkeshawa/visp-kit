import path from "node:path";

import {
  budgetArtifactPath,
  budgetReportArtifactPath,
  taskGraphArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import {
  budgetArtifactSchema,
  type BudgetArtifact,
  type BudgetUsage
} from "../artifacts/schemas/budget.schema.js";
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
import { createBudgetSummary, type BudgetSummary } from "../budget/budget-summary.js";
import { compileContext } from "../context/context-compiler.js";
import { markImplementationChecklistSteps } from "../context/implementation-checklist.js";
import { selectTaskById } from "../context/task-selector.js";
import { resolveActiveFeature, type ActiveFeature } from "./shared/active-feature.js";
import { recordWorkflowRun } from "./shared/run-recorder.js";
import { loadTaskGraph } from "./shared/task-graph-loader.js";
import { refreshFeatureTimeline } from "./shared/timeline-refresh.js";

export type BudgetWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly budget?: BudgetMode;
  readonly maxTokens?: number;
  readonly writeReport?: boolean;
  readonly dryRun?: boolean;
  readonly recordUsage?: boolean;
  readonly recordUsageUnavailable?: boolean;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly model?: string;
  readonly usageNote?: string;
  readonly now?: string;
  readonly refreshTimeline?: boolean;
  readonly recordRun?: boolean;
};

async function ensureTaskGraph(input: {
  readonly targetPath: string;
  readonly featureKey: string;
}): Promise<Result<void, VispError>> {
  const exists = await pathExists(taskGraphArtifactPath(input.targetPath, input.featureKey));

  if (!exists.ok) return exists;
  if (!exists.value) {
    return err(
      new VispError("VALIDATION_FAILED", "Task graph is missing. Run `visp tasks` first.", {
        recovery: "visp tasks"
      })
    );
  }

  return ok(undefined);
}

async function estimateTask(input: {
  readonly targetPath: string;
  readonly feature: ActiveFeature;
  readonly taskGraph: TaskGraphArtifact;
  readonly task: Task;
  readonly usage?: BudgetUsage;
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
    actualInputTokens: input.usage?.inputTokens,
    actualOutputTokens: input.usage?.outputTokens,
    actualTotalTokens: input.usage?.totalTokens,
    actualUsageStatus: input.usage?.status ?? "not_recorded",
    actualUsageRecordedAt: input.usage?.recordedAt,
    actualUsageSource: input.usage?.source,
    actualUsageModel: input.usage?.model,
    actualUsageNote: input.usage?.note,
    maxInputTokens: compiled.value.pack.estimatedTokens.maxInput,
    overBudget: compiled.value.pack.overBudget,
    recommendation: compiled.value.pack.recommendation
  });
}

function nextUsageId(usage: readonly BudgetUsage[]): string {
  const max = usage.reduce((highest, item) => {
    const match = /^USG(\d+)$/.exec(item.id);
    if (match === null) return highest;
    return Math.max(highest, Number.parseInt(match[1]!, 10));
  }, 0);

  return `USG${String(max + 1).padStart(3, "0")}`;
}

async function loadBudgetArtifact(targetPath: string): Promise<Result<BudgetArtifact, VispError>> {
  const artifactPath = budgetArtifactPath(targetPath);
  const exists = await pathExists(artifactPath);

  if (!exists.ok) return exists;
  if (!exists.value) return ok({ policies: [], reports: [], usage: [] });

  const artifact = await readArtifact(artifactPath, budgetArtifactSchema, {
    artifactName: "budget"
  });

  if (!artifact.ok) return artifact;

  return ok({
    ...artifact.value,
    usage: artifact.value.usage ?? []
  });
}

function latestUsageFor(input: {
  readonly usage: readonly BudgetUsage[];
  readonly featureId: string;
  readonly taskId: string;
}): BudgetUsage | undefined {
  return input.usage
    .filter((usage) => usage.featureId === input.featureId && usage.taskId === input.taskId)
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))[0];
}

function usageEntry(input: {
  readonly artifact: BudgetArtifact;
  readonly feature: ActiveFeature;
  readonly taskId: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly status: BudgetUsage["status"];
  readonly model?: string;
  readonly note?: string;
  readonly now: string;
}): BudgetUsage {
  return {
    id: nextUsageId(input.artifact.usage),
    featureId: input.feature.id,
    featureSlug: input.feature.slug,
    taskId: input.taskId,
    status: input.status,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    totalTokens: input.totalTokens ?? null,
    model: input.model?.trim() || undefined,
    source: "agent",
    note: input.note?.trim() || undefined,
    recordedAt: input.now
  };
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
  const recordUsage = options.recordUsage ?? false;
  const recordUsageUnavailable = options.recordUsageUnavailable ?? false;
  const refreshTimeline = options.refreshTimeline ?? true;
  const recordRun = options.recordRun ?? true;
  const inputTokens = options.inputTokens ?? 0;
  const outputTokens = options.outputTokens ?? 0;
  const totalTokens = options.totalTokens ?? inputTokens + outputTokens;

  if (recordUsage && recordUsageUnavailable) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Use either --record-usage or --record-usage-unavailable, not both."
      )
    );
  }

  if ((recordUsage || recordUsageUnavailable) && options.taskId === undefined) {
    return err(
      new VispError("VALIDATION_FAILED", "Recording actual token usage requires --task <task-id>.")
    );
  }

  if (recordUsage && totalTokens <= 0) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Recording actual token usage requires --input-tokens, --output-tokens, or --total-tokens."
      )
    );
  }

  if (recordUsageUnavailable && (options.usageNote?.trim() ?? "").length === 0) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Recording unavailable token usage requires --usage-note <reason>."
      )
    );
  }

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

  const budgetArtifact = await loadBudgetArtifact(targetPath);

  if (!budgetArtifact.ok) return budgetArtifact;

  const recordedUsage =
    (recordUsage || recordUsageUnavailable) && options.taskId !== undefined
      ? usageEntry({
          artifact: budgetArtifact.value,
          feature: feature.value,
          taskId: options.taskId,
          inputTokens: recordUsage ? inputTokens : undefined,
          outputTokens: recordUsage ? outputTokens : undefined,
          totalTokens: recordUsage ? totalTokens : undefined,
          status: recordUsageUnavailable ? "unavailable" : "recorded",
          model: options.model,
          note: options.usageNote,
          now
        })
      : undefined;
  const nextBudgetArtifact: BudgetArtifact =
    recordedUsage === undefined
      ? budgetArtifact.value
      : {
          ...budgetArtifact.value,
          usage: [
            ...budgetArtifact.value.usage.filter(
              (usage) =>
                !(
                  usage.featureId === recordedUsage.featureId &&
                  usage.taskId === recordedUsage.taskId
                )
            ),
            recordedUsage
          ]
        };
  const estimates: TaskBudgetEstimate[] = [];

  for (const task of tasks) {
    const usage =
      recordedUsage !== undefined && task.id === recordedUsage.taskId
        ? recordedUsage
        : latestUsageFor({
            usage: nextBudgetArtifact.usage,
            featureId: feature.value.id,
            taskId: task.id
          });
    const estimate = await estimateTask({
      targetPath,
      feature: feature.value,
      taskGraph: taskGraph.value,
      task,
      usage,
      budget: options.budget,
      maxTokens: options.maxTokens,
      now,
      warnings
    });

    if (!estimate.ok) return estimate;

    estimates.push(estimate.value);
  }

  const budgetMode = options.budget ?? feature.value.intent.budgetMode ?? "lean";
  const writtenFiles: string[] = [];

  if (recordedUsage !== undefined) {
    const budgetPath = budgetArtifactPath(targetPath);

    if (!dryRun) {
      const write = await writeArtifact(budgetPath, budgetArtifactSchema, nextBudgetArtifact, {
        artifactName: "budget"
      });

      if (!write.ok) return write;
    }

    writtenFiles.push(relativePath(targetPath, budgetPath));

    const checklist = await markImplementationChecklistSteps({
      targetPath,
      featureKey: feature.value.key,
      taskId: recordedUsage.taskId,
      steps: ["record-usage"],
      status: recordedUsage.status === "unavailable" ? "unavailable" : "done",
      reason: recordedUsage.status === "unavailable" ? recordedUsage.note : undefined,
      evidence:
        recordedUsage.status === "unavailable"
          ? "visp budget --record-usage-unavailable"
          : "visp budget --record-usage",
      dryRun
    });

    if (!checklist.ok) return checklist;
  }

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

  const timeline = refreshTimeline
    ? await refreshFeatureTimeline({
        targetPath,
        feature: feature.value.key,
        taskId: options.taskId,
        dryRun,
        now
      })
    : { writtenFiles: [], warnings: [] };
  const timelineWarnings = timeline.warnings;
  writtenFiles.push(...timeline.writtenFiles);

  const run = recordRun
    ? await recordWorkflowRun({
        targetPath,
        command: "budget",
        endedAt: now,
        feature: {
          id: feature.value.id,
          slug: feature.value.slug
        },
        taskId: options.taskId,
        success: true,
        result: [...warnings, ...timelineWarnings].length > 0 ? "warnings" : "passed",
        actions: writtenFiles.map((filePath) => ({
          path: filePath,
          action: "updated" as const
        })),
        estimatedTokens: estimates.reduce(
          (total, estimate) => total + estimate.estimatedTotalTokens,
          0
        ),
        actualTokens: recordedUsage?.totalTokens ?? undefined,
        warnings: [...warnings, ...timelineWarnings],
        events:
          recordedUsage === undefined
            ? [
                {
                  type: "budget_estimated",
                  message: `Estimated budget for ${estimates.length} task(s).`
                }
              ]
            : [
                recordedUsage.status === "unavailable"
                  ? {
                      type: "usage_recorded",
                      message: `Recorded unavailable actual token usage for ${recordedUsage.taskId}.`,
                      data: {
                        status: recordedUsage.status,
                        note: recordedUsage.note
                      }
                    }
                  : {
                      type: "usage_recorded",
                      message: `Recorded ${recordedUsage.totalTokens ?? 0} actual tokens for ${recordedUsage.taskId}.`,
                      data: {
                        status: recordedUsage.status,
                        inputTokens: recordedUsage.inputTokens,
                        outputTokens: recordedUsage.outputTokens,
                        totalTokens: recordedUsage.totalTokens
                      }
                    }
              ],
        dryRun
      })
    : { writtenFiles: [], warnings: [] };

  writtenFiles.push(...run.writtenFiles);

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
      warnings: [...new Set([...warnings, ...timelineWarnings, ...run.warnings])]
    })
  );
}
