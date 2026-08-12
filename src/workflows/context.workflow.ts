import path from "node:path";

import {
  contextChecklistJsonPath,
  contextChecklistPath,
  contextPackArtifactPath,
  contextPackMarkdownPath,
  contextPromptPath,
  promptArtifactPath,
  projectStatusArtifactPath,
  taskGraphArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import { defaultCommandRunner } from "../core/command-runner.js";
import { type BudgetMode } from "../artifacts/schemas/common.schema.js";
import { contextPackSchema, type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
import { type PolicyGateSummary } from "../artifacts/schemas/gate.schema.js";
import { projectStatusSchema, type ProjectStatus } from "../artifacts/schemas/project.schema.js";
import { VispError } from "../core/errors.js";
import { pathExists, writeTextFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { compileContext } from "../context/context-compiler.js";
import { renderContextMarkdown } from "../context/context-renderer.js";
import {
  createImplementationChecklistArtifact,
  renderImplementationChecklistMarkdown
} from "../context/implementation-checklist.js";
import { implementationChecklistArtifactSchema } from "../artifacts/schemas/implementation-checklist.schema.js";
import { createContextSummary, type ContextSummary } from "../context/context-summary.js";
import { renderCurrentTaskPrompt, renderTaskPrompt } from "../context/prompt-renderer.js";
import {
  selectNextTask,
  selectTaskById,
  validateTaskDependencies
} from "../context/task-selector.js";
import { evaluatePolicyGate, gateResultLabel } from "../gates/policy-gate-summary.js";
import { resolveActiveFeature } from "./shared/active-feature.js";
import { refreshBudgetReport } from "./shared/budget-refresh.js";
import { recordWorkflowRun } from "./shared/run-recorder.js";
import { refreshFeatureTimeline } from "./shared/timeline-refresh.js";
import { artifactGeneratedFile, textGeneratedFile } from "./shared/template-workflow.js";
import {
  type WorkflowFileAction,
  writeGeneratedFiles,
  writeUpdatedGeneratedFiles
} from "./shared/generated-files.js";
import { loadTaskGraph } from "./shared/task-graph-loader.js";
import { wroteFile } from "../agent/agent-file-plan.js";

export type ContextWorkflowOptions = {
  readonly taskId?: string;
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly next?: boolean;
  readonly budget?: BudgetMode;
  readonly maxTokens?: number;
  readonly includeFullFiles?: boolean;
  /**
   * Explicit compact snippet cap (`--snippet-cap on|off`). Undefined leaves the
   * decision to the project config and then the per-mode default.
   */
  readonly snippetCap?: boolean;
  readonly promptOnly?: boolean;
  readonly force?: boolean;
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
      new VispError("VALIDATION_FAILED", "Task graph is missing. Run `visp-kit tasks` first.")
    );
  }

  return ok(undefined);
}

async function updateContextStatus(input: {
  readonly targetPath: string;
  readonly featureId: string;
  readonly featureSlug: string;
  readonly featurePath: string;
  readonly taskId: string;
  readonly now: string;
  readonly dryRun: boolean;
}): Promise<Result<WorkflowFileAction, VispError>> {
  const status = await readArtifact(
    projectStatusArtifactPath(input.targetPath),
    projectStatusSchema,
    { artifactName: "project status" }
  );

  if (!status.ok) return status;

  const nextStatus: ProjectStatus = {
    ...status.value,
    initialized: true,
    activeFeatureId: input.featureId,
    activeFeatureSlug: input.featureSlug,
    activeFeaturePath: input.featurePath,
    activeTaskId: input.taskId,
    currentState: "context_ready",
    lastCommand: "context",
    updatedAt: input.now
  };

  if (!input.dryRun) {
    const write = await writeArtifact(
      projectStatusArtifactPath(input.targetPath),
      projectStatusSchema,
      nextStatus,
      { artifactName: "project status" }
    );

    if (!write.ok) return write;
  }

  return ok({
    path: relativePath(input.targetPath, projectStatusArtifactPath(input.targetPath)),
    action: "updated"
  });
}

function selectedTaskError(options: ContextWorkflowOptions): Result<string, VispError> {
  if (options.next) {
    return err(new VispError("VALIDATION_FAILED", "--next does not use a task ID."));
  }

  if (options.taskId === undefined || options.taskId.trim().length === 0) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Task ID is required. Use `visp-kit context T001` or `visp-kit context --next`."
      )
    );
  }

  return ok(options.taskId);
}

function enrichPackWithGate(input: {
  readonly pack: ContextPack;
  readonly gate?: PolicyGateSummary;
}): ContextPack {
  if (input.gate === undefined) return input.pack;

  return {
    ...input.pack,
    strictnessMode: input.gate.strictnessMode,
    policyStatus: input.gate.policyStatus,
    gateStatus: gateResultLabel(input.gate),
    failedGateRules: input.gate.failedRules,
    blockedCommands: input.gate.blockedCommands,
    policyGate: input.gate
  };
}

function actionFor(
  actions: readonly WorkflowFileAction[],
  filePath: string
): WorkflowFileAction | undefined {
  return actions.find((action) => action.path === filePath);
}

export async function runContextWorkflow(
  options: ContextWorkflowOptions = {}
): Promise<Result<ContextSummary, VispError>> {
  const cwd = options.cwd ?? process.cwd();
  const targetPath = path.resolve(cwd, options.targetPath ?? ".");
  const force = options.force ?? false;
  const dryRun = options.dryRun ?? false;
  const promptOnly = options.promptOnly ?? false;
  const now = options.now ?? new Date().toISOString();

  if (options.next && options.taskId !== undefined) {
    return err(new VispError("VALIDATION_FAILED", "Use either a task ID or --next, not both."));
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

  let selected = selectNextTask(taskGraph.value);

  if (!options.next) {
    const taskId = selectedTaskError(options);

    if (!taskId.ok) return taskId;

    selected = selectTaskById(taskGraph.value, taskId.value);
  }

  if (!selected.ok) return selected;

  if (!/^T\d{3}$/.test(selected.value.id)) {
    return err(new VispError("VALIDATION_FAILED", `${selected.value.id} must use T### format.`));
  }

  const dependencyErrors = validateTaskDependencies(taskGraph.value, selected.value);

  if (dependencyErrors.length > 0) {
    return err(new VispError("VALIDATION_FAILED", dependencyErrors.join(" ")));
  }

  const compiled = await compileContext({
    targetPath,
    feature: feature.value,
    taskGraph: taskGraph.value,
    task: selected.value,
    budgetMode: options.budget,
    maxTokens: options.maxTokens,
    includeFullFiles: options.includeFullFiles,
    ...(options.snippetCap === undefined ? {} : { snippetCap: options.snippetCap }),
    now
  });

  if (!compiled.ok) return compiled;

  const contextMarkdown = contextPackMarkdownPath(targetPath, feature.value.key, selected.value.id);
  const contextJson = contextPackArtifactPath(targetPath, feature.value.key, selected.value.id);
  const taskPrompt = contextPromptPath(targetPath, feature.value.key, selected.value.id);
  const checklist = contextChecklistPath(targetPath, feature.value.key, selected.value.id);
  const checklistJson = contextChecklistJsonPath(targetPath, feature.value.key, selected.value.id);
  const currentPrompt = promptArtifactPath(targetPath, "current-task");
  const contextMarkdownDisplayPath = relativePath(targetPath, contextMarkdown);
  const taskPromptDisplayPath = relativePath(targetPath, taskPrompt);
  const checklistDisplayPath = relativePath(targetPath, checklist);
  const checklistArtifact = createImplementationChecklistArtifact({
    featureId: feature.value.id,
    featureSlug: feature.value.slug,
    taskId: selected.value.id,
    generatedAt: now
  });
  const contextFiles = promptOnly
    ? []
    : [
        textGeneratedFile({
          targetPath,
          path: contextMarkdown,
          contents: compiled.value.markdown
        }),
        artifactGeneratedFile({
          targetPath,
          path: contextJson,
          artifactName: "context pack",
          schema: contextPackSchema,
          value: compiled.value.pack
        }),
        artifactGeneratedFile({
          targetPath,
          path: checklistJson,
          artifactName: "implementation checklist",
          schema: implementationChecklistArtifactSchema,
          value: checklistArtifact
        }),
        textGeneratedFile({
          targetPath,
          path: checklist,
          contents: renderImplementationChecklistMarkdown(checklistArtifact)
        })
      ];
  const written = await writeGeneratedFiles(contextFiles, { force, dryRun });

  if (!written.ok) return written;

  const gate = await evaluatePolicyGate({
    targetPath,
    stage: "implement",
    feature: feature.value.key,
    taskId: selected.value.id,
    now
  });
  const gateWarnings = gate.ok
    ? gate.value.warnings
    : [`Implementation gate could not be evaluated: ${gate.error.message}`];
  // The task's base commit: HEAD at context generation. Weak-model evaluation
  // showed agents reliably implement and COMMIT before running the evidence
  // loop; without a base, verify then saw a clean tree ("No source changes
  // were detected"), every save failed, and no task ever closed. With it,
  // change detection judges the diff since base plus the working tree, so
  // the ceremony is order-tolerant. Per task by construction: T002's context
  // is generated after T001's commits, so T001's work is not in T002's diff.
  const baseCommit = await captureBaseCommit(targetPath);
  const enrichedPack = enrichPackWithGate({
    pack: {
      ...compiled.value.pack,
      ...(baseCommit === undefined ? {} : { baseCommit }),
      warnings: [...new Set([...compiled.value.pack.warnings, ...gateWarnings])]
    },
    gate: gate.ok ? gate.value : undefined
  });
  const enrichedMarkdown = renderContextMarkdown({
    feature: feature.value,
    pack: enrichedPack
  });
  const taskPromptContents = renderTaskPrompt({
    contextPath: contextMarkdownDisplayPath,
    checklistPath: promptOnly ? undefined : checklistDisplayPath,
    pack: enrichedPack
  });
  const promptWrite = await writeGeneratedFiles(
    [
      textGeneratedFile({
        targetPath,
        path: taskPrompt,
        contents: taskPromptContents
      })
    ],
    { force, dryRun }
  );

  if (!promptWrite.ok) return promptWrite;

  if (!promptOnly && !dryRun) {
    const contextMarkdownAction = actionFor(written.value, contextMarkdownDisplayPath);
    const contextJsonAction = actionFor(written.value, relativePath(targetPath, contextJson));

    if (contextMarkdownAction !== undefined && wroteFile(contextMarkdownAction.action)) {
      const rewriteMarkdown = await writeTextFile(contextMarkdown, enrichedMarkdown);

      if (!rewriteMarkdown.ok) return rewriteMarkdown;
    }

    if (contextJsonAction !== undefined && wroteFile(contextJsonAction.action)) {
      const rewriteJson = await writeArtifact(contextJson, contextPackSchema, enrichedPack, {
        artifactName: "context pack"
      });

      if (!rewriteJson.ok) return rewriteJson;
    }
  }

  const current = await writeUpdatedGeneratedFiles(
    [
      textGeneratedFile({
        targetPath,
        path: currentPrompt,
        contents: renderCurrentTaskPrompt({
          promptPath: taskPromptDisplayPath,
          contextPath: contextMarkdownDisplayPath,
          checklistPath: promptOnly ? undefined : checklistDisplayPath,
          pack: enrichedPack
        })
      })
    ],
    { dryRun }
  );

  if (!current.ok) return current;

  const actions: WorkflowFileAction[] = [...written.value, ...promptWrite.value, ...current.value];
  const budgetRefreshWarnings: string[] = [];

  if (!promptOnly) {
    const status = await updateContextStatus({
      targetPath,
      featureId: feature.value.id,
      featureSlug: feature.value.slug,
      featurePath: feature.value.relativePath,
      taskId: selected.value.id,
      now,
      dryRun
    });

    if (!status.ok) return status;

    actions.push(status.value);

    const budgetRefresh = await refreshBudgetReport({
      targetPath,
      feature: feature.value.key,
      taskId: selected.value.id,
      dryRun,
      now
    });

    actions.push(
      ...budgetRefresh.writtenFiles.map((filePath) => ({
        path: filePath,
        action: "updated" as const
      }))
    );
    budgetRefreshWarnings.push(...budgetRefresh.warnings);

    const timeline = await refreshFeatureTimeline({
      targetPath,
      feature: feature.value.key,
      taskId: selected.value.id,
      dryRun,
      now
    });

    actions.push(
      ...timeline.writtenFiles.map((filePath) => ({
        path: filePath,
        action: "updated" as const
      }))
    );
    budgetRefreshWarnings.push(...timeline.warnings);
  }

  const run = await recordWorkflowRun({
    targetPath,
    command: "context",
    endedAt: now,
    feature: {
      id: feature.value.id,
      slug: feature.value.slug
    },
    taskId: selected.value.id,
    success: true,
    result: [...enrichedPack.warnings, ...budgetRefreshWarnings].length > 0 ? "warnings" : "passed",
    actions,
    estimatedTokens: enrichedPack.estimatedTokens.total,
    warnings: [...new Set([...enrichedPack.warnings, ...budgetRefreshWarnings])],
    events: [
      {
        type: "budget_estimated",
        message: `Estimated ${enrichedPack.estimatedTokens.total} total tokens for ${selected.value.id}.`,
        data: {
          input: enrichedPack.estimatedTokens.input,
          expectedOutput: enrichedPack.estimatedTokens.expectedOutput,
          total: enrichedPack.estimatedTokens.total
        }
      },
      {
        type: "gate_evaluated",
        message: `Implementation gate ${gate.ok && gate.value.allowed ? "allowed" : "blocked or unavailable"}.`
      }
    ],
    dryRun
  });

  actions.push(
    ...run.writtenFiles.map((filePath) => ({
      path: filePath,
      action: "updated" as const
    }))
  );

  return ok(
    createContextSummary({
      targetPath,
      feature: {
        id: feature.value.id,
        slug: feature.value.slug,
        path: feature.value.relativePath
      },
      taskId: selected.value.id,
      budgetMode: enrichedPack.budgetMode,
      estimatedTokens: {
        input: enrichedPack.estimatedTokens.input,
        expectedOutput: enrichedPack.estimatedTokens.expectedOutput,
        total: enrichedPack.estimatedTokens.total,
        maxInput: enrichedPack.estimatedTokens.maxInput
      },
      overBudget: enrichedPack.overBudget,
      recommendation: enrichedPack.recommendation,
      actions,
      promptOnly,
      dryRun,
      warnings: [...new Set([...enrichedPack.warnings, ...budgetRefreshWarnings, ...run.warnings])]
    })
  );
}

/** HEAD at context generation, or undefined outside a git repository. */
async function captureBaseCommit(targetPath: string): Promise<string | undefined> {
  const result = await defaultCommandRunner.run("git", ["rev-parse", "HEAD"], {
    cwd: targetPath
  });
  if (!result.ok || result.value.exitCode !== 0) return undefined;
  const commit = result.value.stdout.trim();
  return /^[0-9a-f]{40}$/u.test(commit) ? commit : undefined;
}
