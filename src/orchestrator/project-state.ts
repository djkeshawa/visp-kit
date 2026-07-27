import { readdir } from "node:fs/promises";
import path from "node:path";
import { type ZodType, type ZodTypeDef } from "zod";

import {
  clarificationsArtifactPath,
  compactConstitutionArtifactPath,
  budgetArtifactPath,
  contextPackArtifactPath,
  contextChecklistJsonPath,
  dependencyMapArtifactPath,
  featureIntentArtifactPath,
  featurePrArtifactPath,
  featureReconcileArtifactPath,
  featureReviewArtifactPath,
  fileIndexArtifactPath,
  fileSummariesArtifactPath,
  featuresArtifactDir,
  moduleMapArtifactPath,
  planArtifactPath,
  projectConfigArtifactPath,
  projectProfileArtifactPath,
  projectStatusArtifactPath,
  reconcileArtifactDir,
  scanMetaArtifactPath,
  specArtifactPath,
  taskGraphArtifactPath,
  taskReconcileArtifactPath,
  taskReviewArtifactPath,
  testMapArtifactPath,
  traceabilityArtifactPath,
  verificationArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { contextPackSchema, type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
import {
  budgetArtifactSchema,
  type BudgetArtifact,
  type BudgetUsage
} from "../artifacts/schemas/budget.schema.js";
import { featureIntentSchema, type FeatureIntent } from "../artifacts/schemas/feature.schema.js";
import {
  implementationChecklistArtifactSchema,
  type ImplementationChecklistArtifact
} from "../artifacts/schemas/implementation-checklist.schema.js";
import {
  planDraftArtifactSchema,
  type PlanDraftArtifact
} from "../artifacts/schemas/plan.schema.js";
import {
  projectConfigSchema,
  projectProfileSchema,
  projectStatusSchema,
  type ProjectConfig,
  type ProjectProfile,
  type ProjectStatus
} from "../artifacts/schemas/project.schema.js";
import { prArtifactSchema, type PrArtifact } from "../artifacts/schemas/pr.schema.js";
import {
  reconcileReportSchema,
  type ReconcileReport
} from "../artifacts/schemas/reconcile.schema.js";
import { reviewReportSchema, type ReviewReport } from "../artifacts/schemas/review.schema.js";
import { specArtifactSchema, type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import {
  type Task,
  taskGraphArtifactSchema,
  type TaskGraphArtifact
} from "../artifacts/schemas/task.schema.js";
import {
  traceabilityMatrixSchema,
  type TraceabilityMatrix
} from "../artifacts/schemas/traceability.schema.js";
import {
  verificationReportSchema,
  type VerificationReport
} from "../artifacts/schemas/verification.schema.js";
import { defaultCommandRunner, type CommandRunner } from "../core/command-runner.js";
import { VispError, toVispError } from "../core/errors.js";
import { pathExists, readJsonFile } from "../core/file-system.js";
import { listGitUntrackedFiles } from "../core/git-untracked.js";
import { relativePath, vispDir } from "../core/paths.js";
import { ok, type Result } from "../core/result.js";
import { parseFeatureNumber } from "../features/feature-id.js";

export type ArtifactSummary = {
  readonly clarifications: boolean;
  readonly spec: boolean;
  readonly plan: boolean;
  readonly taskGraph: boolean;
  readonly traceability: boolean;
  readonly context: boolean;
  readonly verification: boolean;
  readonly review: boolean;
  readonly reconcile: boolean;
  readonly pr: boolean;
};

export type TaskSummary = {
  readonly total: number;
  readonly ready: number;
  readonly pending: number;
  readonly inProgress: number;
  readonly blocked: number;
  readonly done: number;
  readonly verified: number;
};

export type GitState = {
  readonly isRepo: boolean;
  readonly branch: string | null;
  readonly stagedCount: number;
  readonly unstagedCount: number;
  readonly changedFiles: readonly string[];
  readonly warnings: readonly string[];
};

export type ProjectState = {
  readonly targetPath: string;
  readonly initialized: boolean;
  readonly config?: ProjectConfig;
  readonly profile?: ProjectProfile;
  readonly status?: ProjectStatus;
  readonly selectedFeature?: {
    readonly id: string;
    readonly slug: string;
    readonly key: string;
    readonly relativePath: string;
    readonly intent?: FeatureIntent;
  };
  readonly selectedTask?: Task;
  readonly taskGraph?: TaskGraphArtifact;
  readonly spec?: SpecArtifact;
  readonly plan?: PlanDraftArtifact;
  readonly traceability?: TraceabilityMatrix;
  readonly contextPack?: ContextPack;
  readonly implementationChecklist?: ImplementationChecklistArtifact;
  readonly budget?: BudgetArtifact;
  readonly actualUsage?: BudgetUsage;
  readonly verification?: VerificationReport;
  readonly review?: ReviewReport;
  readonly reconcile?: ReconcileReport;
  readonly pr?: PrArtifact;
  readonly artifactSummary: ArtifactSummary;
  readonly taskSummary: TaskSummary;
  readonly scanned: boolean;
  readonly constitution: boolean;
  readonly scanCacheFiles: Record<string, boolean>;
  readonly git: GitState;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
};

export type ProjectStateOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly commandRunner?: CommandRunner;
};

async function exists(filePath: string): Promise<boolean> {
  const result = await pathExists(filePath);
  return result.ok && result.value;
}

async function readOptional<Output, Input = Output>(input: {
  readonly filePath: string;
  readonly schema: ZodType<Output, ZodTypeDef, Input>;
  readonly artifactName: string;
  readonly warnings: string[];
  /**
   * Collector for artifacts whose corruption invalidates the whole state. When
   * supplied, a file that exists but cannot be read is recorded here instead of
   * as a warning.
   */
  readonly errors?: string[];
}): Promise<Output | undefined> {
  if (!(await exists(input.filePath))) return undefined;

  const artifact = await readArtifact(input.filePath, input.schema, {
    artifactName: input.artifactName
  });

  if (artifact.ok) return artifact.value;

  // An artifact that exists but cannot be parsed is not the same as one that
  // was never written. Collapsing both to `undefined` lets a corrupted file
  // read as a fresh project, so every downstream check that asks "has this
  // been done yet?" gets the wrong answer from state nobody could read.
  const message = `${input.artifactName} is unreadable: ${artifact.error.message}`;

  if (input.errors === undefined) input.warnings.push(message);
  else input.errors.push(message);

  return undefined;
}

function slugFromKey(key: string): string {
  return key.slice(4);
}

async function featureNames(targetPath: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(featuresArtifactDir(targetPath), {
      withFileTypes: true
    });

    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function featureSelector(
  status: ProjectStatus | undefined,
  feature: string | undefined
): string | undefined {
  if (feature !== undefined) return feature;
  return (
    status?.activeFeaturePath?.split("/").at(-1) ??
    status?.activeFeatureId ??
    status?.activeFeatureSlug ??
    undefined
  );
}

function matchFeature(names: readonly string[], selector: string | undefined): string | undefined {
  if (selector === undefined || selector.trim().length === 0) return undefined;
  const normalized = selector.trim();
  const matches = names.filter(
    (name) =>
      name === normalized || name.startsWith(`${normalized}-`) || slugFromKey(name) === normalized
  );

  return matches.length === 1 ? matches[0] : undefined;
}

function summarizeTasks(taskGraph: TaskGraphArtifact | undefined): TaskSummary {
  const tasks = taskGraph?.tasks ?? [];

  return {
    total: tasks.length,
    ready: tasks.filter((task) => task.status === "ready").length,
    pending: tasks.filter((task) => task.status === "pending").length,
    inProgress: tasks.filter((task) => task.status === "in_progress").length,
    blocked: tasks.filter((task) => task.status === "blocked").length,
    done: tasks.filter((task) => task.status === "done").length,
    verified: tasks.filter((task) => task.status === "verified").length
  };
}

export function selectWorkflowTask(input: {
  readonly taskGraph?: TaskGraphArtifact;
  readonly taskId?: string;
  readonly activeTaskId?: string | null;
}): Task | undefined {
  const tasks = input.taskGraph?.tasks ?? [];
  const selectedId = input.taskId ?? input.activeTaskId ?? undefined;
  const exact = selectedId === undefined ? undefined : tasks.find((task) => task.id === selectedId);

  if (exact !== undefined) return exact;

  return (
    tasks.find((task) => task.status === "ready") ??
    tasks.find((task) => task.status === "pending") ??
    tasks.find((task) => task.status !== "done" && task.status !== "verified") ??
    tasks[0]
  );
}

async function gitState(targetPath: string, runner: CommandRunner): Promise<GitState> {
  const warnings: string[] = [];
  const repo = await runner.run("git", ["rev-parse", "--is-inside-work-tree"], { cwd: targetPath });

  if (!repo.ok || repo.value.stdout.trim() !== "true") {
    return {
      isRepo: false,
      branch: null,
      stagedCount: 0,
      unstagedCount: 0,
      changedFiles: [],
      warnings: ["Git repository unavailable."]
    };
  }

  const branch = await runner.run("git", ["branch", "--show-current"], { cwd: targetPath });
  const staged = await runner.run("git", ["diff", "--cached", "--name-only", "-z", "--"], {
    cwd: targetPath
  });
  const unstaged = await runner.run("git", ["diff", "--name-only", "-z", "--"], {
    cwd: targetPath
  });
  const untracked = await listGitUntrackedFiles({ targetPath, commandRunner: runner });

  if (!branch.ok) warnings.push("Unable to read current Git branch.");
  if (!staged.ok) warnings.push("Unable to read staged Git changes.");
  if (!unstaged.ok) warnings.push("Unable to read unstaged Git changes.");
  if (!untracked.ok) warnings.push("Unable to read untracked Git changes.");

  const stagedFiles = staged.ok
    ? staged.value.stdout.split("\0").filter((filePath) => filePath.length > 0)
    : [];
  const unstagedFiles = unstaged.ok
    ? unstaged.value.stdout.split("\0").filter((filePath) => filePath.length > 0)
    : [];
  const unstagedAndUntracked = [
    ...new Set([...unstagedFiles, ...(untracked.ok ? untracked.value : [])])
  ];

  return {
    isRepo: true,
    branch: branch.ok ? branch.value.stdout.trim() || null : null,
    stagedCount: stagedFiles.length,
    unstagedCount: unstagedAndUntracked.length,
    changedFiles: [...new Set([...stagedFiles, ...unstagedAndUntracked])].sort(),
    warnings
  };
}

async function scanIsPopulated(
  targetPath: string,
  scanCacheFiles: Record<string, boolean>
): Promise<boolean> {
  if (!Object.values(scanCacheFiles).every(Boolean)) return false;

  const meta = await readJsonFile<Record<string, unknown>>(scanMetaArtifactPath(targetPath));

  if (!meta.ok) return false;
  if (meta.value.status === "pending") return false;
  return typeof meta.value.generatedAt === "string" && meta.value.generatedAt.length > 0;
}

export async function loadProjectState(
  options: ProjectStateOptions = {}
): Promise<Result<ProjectState, VispError>> {
  const cwd = options.cwd ?? process.cwd();
  const targetPath = path.resolve(cwd, options.targetPath ?? ".");
  const runner = options.commandRunner ?? defaultCommandRunner;
  const warnings: string[] = [];
  const errors: string[] = [];
  const initialized = await exists(vispDir(targetPath));
  const emptyArtifacts: ArtifactSummary = {
    clarifications: false,
    spec: false,
    plan: false,
    taskGraph: false,
    traceability: false,
    context: false,
    verification: false,
    review: false,
    reconcile: false,
    pr: false
  };

  if (!initialized) {
    const git = await gitState(targetPath, runner);

    return ok({
      targetPath,
      initialized: false,
      artifactSummary: emptyArtifacts,
      taskSummary: summarizeTasks(undefined),
      scanned: false,
      constitution: false,
      scanCacheFiles: {},
      git,
      warnings: ["Visp Kit is not initialized.", ...git.warnings],
      errors
    });
  }

  // The three core state artifacts. Every routing decision below reads them,
  // so corruption here is an error rather than a warning: advising from state
  // that could not be parsed is worse than refusing to advise.
  const config = await readOptional({
    filePath: projectConfigArtifactPath(targetPath),
    schema: projectConfigSchema,
    artifactName: "project config",
    warnings,
    errors
  });
  const profile = await readOptional({
    filePath: projectProfileArtifactPath(targetPath),
    schema: projectProfileSchema,
    artifactName: "project profile",
    warnings,
    errors
  });
  const status = await readOptional({
    filePath: projectStatusArtifactPath(targetPath),
    schema: projectStatusSchema,
    artifactName: "project status",
    warnings,
    errors
  });
  const names = await featureNames(targetPath);
  const key = matchFeature(names, featureSelector(status, options.feature));
  const featureId =
    key === undefined ? undefined : String(parseFeatureNumber(key) ?? "").padStart(3, "0");
  const selectedFeature =
    key === undefined
      ? undefined
      : {
          id: featureId ?? key.slice(0, 3),
          slug: slugFromKey(key),
          key,
          relativePath: `.visp/features/${key}`,
          intent: await readOptional({
            filePath: featureIntentArtifactPath(targetPath, key),
            schema: featureIntentSchema,
            artifactName: "feature intent",
            warnings
          })
        };

  if (options.feature !== undefined && selectedFeature === undefined) {
    errors.push(`Feature not found: ${options.feature}.`);
  }

  const taskGraph =
    key === undefined
      ? undefined
      : await readOptional({
          filePath: taskGraphArtifactPath(targetPath, key),
          schema: taskGraphArtifactSchema,
          artifactName: "task graph",
          warnings
        });
  const selectedTask = selectWorkflowTask({
    taskGraph,
    taskId: options.taskId,
    activeTaskId: status?.activeTaskId
  });

  if (
    options.taskId !== undefined &&
    taskGraph !== undefined &&
    selectedTask?.id !== options.taskId
  ) {
    errors.push(`Task not found: ${options.taskId}.`);
  }

  const spec =
    key === undefined
      ? undefined
      : await readOptional({
          filePath: specArtifactPath(targetPath, key),
          schema: specArtifactSchema,
          artifactName: "spec",
          warnings
        });
  const plan =
    key === undefined
      ? undefined
      : await readOptional({
          filePath: planArtifactPath(targetPath, key),
          schema: planDraftArtifactSchema,
          artifactName: "plan",
          warnings
        });
  const traceability =
    key === undefined
      ? undefined
      : await readOptional({
          filePath: traceabilityArtifactPath(targetPath, key),
          schema: traceabilityMatrixSchema,
          artifactName: "traceability",
          warnings
        });
  const contextPack =
    key === undefined || selectedTask === undefined
      ? undefined
      : await readOptional({
          filePath: contextPackArtifactPath(targetPath, key, selectedTask.id),
          schema: contextPackSchema,
          artifactName: "context pack",
          warnings
        });
  const implementationChecklist =
    key === undefined || selectedTask === undefined
      ? undefined
      : await readOptional({
          filePath: contextChecklistJsonPath(targetPath, key, selectedTask.id),
          schema: implementationChecklistArtifactSchema,
          artifactName: "implementation checklist",
          warnings
        });
  const budget = await readOptional({
    filePath: budgetArtifactPath(targetPath),
    schema: budgetArtifactSchema,
    artifactName: "budget",
    warnings
  });
  const actualUsage = budget?.usage
    .filter(
      (usage) =>
        selectedFeature !== undefined &&
        selectedTask !== undefined &&
        usage.featureId === selectedFeature.id &&
        usage.taskId === selectedTask.id
    )
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))[0];
  const verification =
    key === undefined
      ? undefined
      : await readOptional({
          filePath: verificationArtifactPath(targetPath, key),
          schema: verificationReportSchema,
          artifactName: "verification report",
          warnings
        });
  const review =
    key === undefined
      ? undefined
      : await readOptional({
          filePath:
            selectedTask === undefined
              ? featureReviewArtifactPath(targetPath, key)
              : taskReviewArtifactPath(targetPath, key, selectedTask.id),
          schema: reviewReportSchema,
          artifactName: "review report",
          warnings
        });
  const reconcile =
    key === undefined
      ? undefined
      : await readOptional({
          filePath:
            selectedTask === undefined
              ? featureReconcileArtifactPath(targetPath, key)
              : taskReconcileArtifactPath(targetPath, key, selectedTask.id),
          schema: reconcileReportSchema,
          artifactName: "reconcile report",
          warnings
        });
  const pr =
    key === undefined
      ? undefined
      : await readOptional({
          filePath: featurePrArtifactPath(targetPath, key),
          schema: prArtifactSchema,
          artifactName: "PR summary",
          warnings
        });
  const scanCacheFiles = {
    "file-index.json": await exists(fileIndexArtifactPath(targetPath)),
    "file-summaries.json": await exists(fileSummariesArtifactPath(targetPath)),
    "module-map.json": await exists(moduleMapArtifactPath(targetPath)),
    "test-map.json": await exists(testMapArtifactPath(targetPath)),
    "dependency-map.json": await exists(dependencyMapArtifactPath(targetPath)),
    "scan-meta.json": await exists(scanMetaArtifactPath(targetPath))
  };
  const artifactSummary: ArtifactSummary = {
    clarifications:
      key === undefined ? false : await exists(clarificationsArtifactPath(targetPath, key)),
    spec: spec !== undefined,
    plan: plan !== undefined,
    taskGraph: taskGraph !== undefined,
    traceability: traceability !== undefined,
    context: contextPack !== undefined,
    verification: verification !== undefined,
    review: review !== undefined,
    reconcile: reconcile !== undefined,
    pr: pr !== undefined
  };

  const git = await gitState(targetPath, runner);
  const scanned = await scanIsPopulated(targetPath, scanCacheFiles);

  return ok({
    targetPath,
    initialized,
    config,
    profile,
    status,
    selectedFeature,
    selectedTask,
    taskGraph,
    spec,
    plan,
    traceability,
    contextPack,
    implementationChecklist,
    budget,
    actualUsage,
    verification,
    review,
    reconcile,
    pr,
    artifactSummary,
    taskSummary: summarizeTasks(taskGraph),
    scanned,
    constitution: await exists(compactConstitutionArtifactPath(targetPath)),
    scanCacheFiles,
    git,
    warnings: [...warnings, ...git.warnings],
    errors
  });
}

export function projectStateError(message: string): VispError {
  return new VispError("VALIDATION_FAILED", message);
}

export function stateError(error: unknown): VispError {
  return toVispError(error, "VALIDATION_FAILED");
}

export function featureReviewPath(state: ProjectState): string | null {
  return state.selectedFeature === undefined
    ? null
    : relativePath(
        state.targetPath,
        featureReviewArtifactPath(state.targetPath, state.selectedFeature.key)
      );
}

export function reconcileReportDirectory(state: ProjectState): string | null {
  return state.selectedFeature === undefined
    ? null
    : relativePath(
        state.targetPath,
        reconcileArtifactDir(state.targetPath, state.selectedFeature.key)
      );
}
