import path from "node:path";

import {
  contextPackArtifactPath,
  contextPackMarkdownPath,
  contextPromptPath,
  promptArtifactPath,
  projectStatusArtifactPath,
  taskGraphArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import { type BudgetMode } from "../artifacts/schemas/common.schema.js";
import { contextPackSchema } from "../artifacts/schemas/context-pack.schema.js";
import {
  projectStatusSchema,
  type ProjectStatus
} from "../artifacts/schemas/project.schema.js";
import { VispError } from "../core/errors.js";
import { pathExists } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { compileContext } from "../context/context-compiler.js";
import {
  createContextSummary,
  type ContextSummary
} from "../context/context-summary.js";
import { renderCurrentTaskPrompt, renderTaskPrompt } from "../context/prompt-renderer.js";
import { selectNextTask, selectTaskById, validateTaskDependencies } from "../context/task-selector.js";
import { resolveActiveFeature } from "./shared/active-feature.js";
import {
  artifactGeneratedFile,
  textGeneratedFile
} from "./shared/template-workflow.js";
import {
  type WorkflowFileAction,
  writeGeneratedFiles,
  writeUpdatedGeneratedFiles
} from "./shared/generated-files.js";
import { loadTaskGraph } from "./shared/task-graph-loader.js";

export type ContextWorkflowOptions = {
  readonly taskId?: string;
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly next?: boolean;
  readonly budget?: BudgetMode;
  readonly maxTokens?: number;
  readonly includeFullFiles?: boolean;
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
      new VispError(
        "VALIDATION_FAILED",
        "Task graph is missing. Run `visp tasks` first."
      )
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
        "Task ID is required. Use `visp context T001` or `visp context --next`."
      )
    );
  }

  return ok(options.taskId);
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
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Use either a task ID or --next, not both."
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

  let selected = selectNextTask(taskGraph.value);

  if (!options.next) {
    const taskId = selectedTaskError(options);

    if (!taskId.ok) return taskId;

    selected = selectTaskById(taskGraph.value, taskId.value);
  }

  if (!selected.ok) return selected;

  if (!/^T\d{3}$/.test(selected.value.id)) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `${selected.value.id} must use T### format.`
      )
    );
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
    now
  });

  if (!compiled.ok) return compiled;

  const contextMarkdown = contextPackMarkdownPath(
    targetPath,
    feature.value.key,
    selected.value.id
  );
  const contextJson = contextPackArtifactPath(
    targetPath,
    feature.value.key,
    selected.value.id
  );
  const taskPrompt = contextPromptPath(targetPath, feature.value.key, selected.value.id);
  const currentPrompt = promptArtifactPath(targetPath, "current-task");
  const contextMarkdownDisplayPath = relativePath(targetPath, contextMarkdown);
  const taskPromptDisplayPath = relativePath(targetPath, taskPrompt);
  const taskPromptContents = renderTaskPrompt({
    contextPath: contextMarkdownDisplayPath,
    pack: compiled.value.pack
  });
  const files = promptOnly
    ? [
        textGeneratedFile({
          targetPath,
          path: taskPrompt,
          contents: taskPromptContents
        })
      ]
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
        textGeneratedFile({
          targetPath,
          path: taskPrompt,
          contents: taskPromptContents
        })
      ];
  const written = await writeGeneratedFiles(files, { force, dryRun });

  if (!written.ok) return written;

  const current = await writeUpdatedGeneratedFiles(
    [
      textGeneratedFile({
        targetPath,
        path: currentPrompt,
        contents: renderCurrentTaskPrompt({
          promptPath: taskPromptDisplayPath,
          contextPath: contextMarkdownDisplayPath,
          pack: compiled.value.pack
        })
      })
    ],
    { dryRun }
  );

  if (!current.ok) return current;

  const actions: WorkflowFileAction[] = [...written.value, ...current.value];

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
  }

  return ok(
    createContextSummary({
      targetPath,
      feature: {
        id: feature.value.id,
        slug: feature.value.slug,
        path: feature.value.relativePath
      },
      taskId: selected.value.id,
      budgetMode: compiled.value.pack.budgetMode,
      estimatedTokens: {
        input: compiled.value.pack.estimatedTokens.input,
        expectedOutput: compiled.value.pack.estimatedTokens.expectedOutput,
        total: compiled.value.pack.estimatedTokens.total,
        maxInput: compiled.value.pack.estimatedTokens.maxInput
      },
      overBudget: compiled.value.pack.overBudget,
      recommendation: compiled.value.pack.recommendation,
      actions,
      promptOnly,
      dryRun,
      warnings: compiled.value.warnings
    })
  );
}
