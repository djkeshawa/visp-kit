import path from "node:path";
import { type ZodType, type ZodTypeDef } from "zod";

import {
  contextPackArtifactPath,
  planArtifactPath,
  projectProfileArtifactPath,
  projectStatusArtifactPath,
  specArtifactPath,
  taskGraphArtifactPath,
  traceabilityArtifactPath,
  verificationArtifactPath,
  verificationMarkdownPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import { contextPackSchema, type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
import { planDraftArtifactSchema } from "../artifacts/schemas/plan.schema.js";
import {
  projectProfileSchema,
  projectStatusSchema,
  type ProjectStatus
} from "../artifacts/schemas/project.schema.js";
import { specArtifactSchema } from "../artifacts/schemas/spec.schema.js";
import {
  taskGraphArtifactSchema,
  type Task,
  type TaskGraphArtifact
} from "../artifacts/schemas/task.schema.js";
import { traceabilityMatrixSchema } from "../artifacts/schemas/traceability.schema.js";
import {
  verificationReportSchema,
  type ArtifactValidationSection,
  type CommandValidationSection,
  type DependencyValidationSection,
  type ScopeValidationSection,
  type TraceabilityValidationSection,
  type VerificationMode,
  type VerificationReport
} from "../artifacts/schemas/verification.schema.js";
import { type CommandRunner } from "../core/command-runner.js";
import { VispError } from "../core/errors.js";
import { pathExists, writeTextFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import {
  getImplementationChecklistSummary,
  implementationChecklistStatusLine,
  markImplementationChecklistSteps
} from "../context/implementation-checklist.js";
import { selectTaskById } from "../context/task-selector.js";
import { validateArtifacts } from "../verification/artifact-validator.js";
import { validateDependencies } from "../verification/dependency-validator.js";
import { getGitChangedFiles } from "../verification/git-diff.js";
import {
  createVerificationSummary,
  renderVerificationMarkdown
} from "../verification/verification-report.js";
import { runVerificationCommands } from "../verification/verification-runner.js";
import { formatVerifySummary, type VerifySummary } from "../verification/verification-summary.js";
import {
  evaluatePolicyGate,
  gateBlocksWorkflow,
  gateFailureMessages,
  gateWarningMessages
} from "../gates/policy-gate-summary.js";
import { validateScope } from "../verification/scope-validator.js";
import { validateTraceability } from "../verification/traceability-validator.js";
import {
  selectValidationCommands,
  type VerificationCommandMode
} from "../verification/validation-command-selector.js";
import { resolveActiveFeature } from "./shared/active-feature.js";
import { refreshBudgetReport } from "./shared/budget-refresh.js";
import { loadTaskGraph } from "./shared/task-graph-loader.js";
import { recordWorkflowRun } from "./shared/run-recorder.js";
import { refreshFeatureTimeline } from "./shared/timeline-refresh.js";

export type VerifyWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly targeted?: boolean;
  readonly all?: boolean;
  readonly commands?: boolean;
  readonly skipCommands?: boolean;
  readonly artifacts?: boolean;
  readonly traceability?: boolean;
  readonly scope?: boolean;
  readonly dependencies?: boolean;
  /**
   * Git ref to compare against in addition to the working tree. Without it
   * scope validation only sees uncommitted work, so `git commit` hides an
   * out-of-scope change from VSP011/VSP012.
   */
  readonly base?: string;
  readonly updateTaskStatus?: boolean;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly jsonOutput?: boolean;
  readonly now?: string;
  readonly commandRunner?: CommandRunner;
};

type CheckPlan = {
  readonly artifacts: boolean;
  readonly traceability: boolean;
  readonly commands: boolean;
  readonly scope: boolean;
  readonly dependencies: boolean;
};

async function optionalArtifact<T>(input: {
  readonly path: string;
  readonly schema: ZodType<T, ZodTypeDef, unknown>;
  readonly artifactName: string;
  readonly warnings: string[];
}): Promise<T | undefined> {
  const exists = await pathExists(input.path);

  if (!exists.ok || !exists.value) {
    input.warnings.push(`Optional artifact missing: ${input.artifactName}.`);
    return undefined;
  }

  const artifact = await readArtifact(input.path, input.schema, {
    artifactName: input.artifactName
  });

  if (!artifact.ok) {
    input.warnings.push(
      `Optional artifact unreadable: ${input.artifactName}. ${artifact.error.message}`
    );
    return undefined;
  }

  return artifact.value;
}

function skippedArtifacts(): ArtifactValidationSection {
  return { status: "skipped", checked: [], warnings: [], errors: [] };
}

function skippedTraceability(taskId?: string): TraceabilityValidationSection {
  return { status: "skipped", checkedTaskId: taskId ?? null, warnings: [], errors: [] };
}

function skippedCommands(reason: string): CommandValidationSection {
  return { status: "skipped", commands: [], warnings: [reason], errors: [] };
}

function skippedScope(): ScopeValidationSection {
  return {
    status: "skipped",
    changedFiles: [],
    allowedFiles: [],
    expectedFiles: [],
    forbiddenFiles: [],
    outOfScopeFiles: [],
    forbiddenChangedFiles: [],
    unmappedChangedFiles: [],
    warnings: [],
    errors: []
  };
}

function skippedDependencies(): DependencyValidationSection {
  return {
    status: "skipped",
    changedDependencyFiles: [],
    approvedByTaskScope: false,
    approvedByPlan: false,
    warnings: [],
    errors: []
  };
}

function checksFromOptions(options: VerifyWorkflowOptions): CheckPlan {
  const checkFlags = [
    options.artifacts,
    options.traceability,
    options.scope,
    options.dependencies
  ].some(Boolean);

  return {
    artifacts: checkFlags ? options.artifacts === true : true,
    traceability: checkFlags ? options.traceability === true : true,
    scope: checkFlags ? options.scope === true : true,
    dependencies: checkFlags ? options.dependencies === true : true,
    commands: options.skipCommands === true ? false : options.commands === true || !checkFlags
  };
}

function commandMode(input: {
  readonly task?: Task;
  readonly all?: boolean;
  readonly targeted?: boolean;
}): VerificationCommandMode {
  if (input.all) return "all";
  if (input.task !== undefined || input.targeted) return "targeted";
  return "feature";
}

function reportMode(input: {
  readonly checks: CheckPlan;
  readonly all?: boolean;
  readonly task?: Task;
}): VerificationMode {
  const enabled = Object.entries(input.checks)
    .filter(([, value]) => value)
    .map(([key]) => key);

  if (enabled.length === 1) {
    const only = enabled[0];
    if (only === "artifacts") return "artifacts";
    if (only === "traceability") return "traceability";
    if (only === "scope") return "scope";
    if (only === "dependencies") return "dependencies";
  }

  if (input.all) return "all";
  if (input.task !== undefined) return "targeted";
  return "feature";
}

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

async function selectedTaskFromStatus(input: {
  readonly targetPath: string;
  readonly taskId?: string;
}): Promise<Result<string | undefined, VispError>> {
  if (input.taskId !== undefined) return ok(input.taskId);

  const status = await readArtifact(
    projectStatusArtifactPath(input.targetPath),
    projectStatusSchema,
    { artifactName: "project status" }
  );

  if (!status.ok) return status;

  return ok(status.value.activeTaskId ?? undefined);
}

function commandSection(input: {
  readonly results: readonly CommandValidationSection["commands"][number][];
  readonly warnings: readonly string[];
}): CommandValidationSection {
  const errors = input.results
    .filter((result) => !result.success && !result.skipped)
    .map((result) => `Command failed: ${result.command}`);
  const allSkipped = input.results.length > 0 && input.results.every((result) => result.skipped);

  return {
    status:
      input.results.length === 0
        ? input.warnings.length > 0
          ? "warned"
          : "skipped"
        : allSkipped
          ? "skipped"
          : errors.length > 0
            ? "failed"
            : "passed",
    commands: [...input.results],
    warnings: [...input.warnings],
    errors
  };
}

function collectWarnings(report: Omit<VerificationReport, "summary">): readonly string[] {
  return [
    ...report.artifactValidation.warnings,
    ...report.traceabilityValidation.warnings,
    ...report.commandValidation.warnings,
    ...report.scopeValidation.warnings,
    ...report.dependencyValidation.warnings
  ];
}

function collectErrors(report: Omit<VerificationReport, "summary">): readonly string[] {
  return [
    ...report.errors,
    ...report.artifactValidation.errors,
    ...report.traceabilityValidation.errors,
    ...report.commandValidation.errors,
    ...report.scopeValidation.errors,
    ...report.dependencyValidation.errors
  ];
}

async function updateTaskStatus(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly featureId: string;
  readonly featureSlug: string;
  readonly featurePath: string;
  readonly taskGraph: TaskGraphArtifact;
  readonly task: Task;
  readonly now: string;
  readonly dryRun: boolean;
}): Promise<Result<void, VispError>> {
  const updatedGraph: TaskGraphArtifact = {
    ...input.taskGraph,
    tasks: input.taskGraph.tasks.map((task) =>
      task.id === input.task.id ? { ...task, status: "verified" } : task
    ),
    updatedAt: input.now
  };
  const status = await readArtifact(
    projectStatusArtifactPath(input.targetPath),
    projectStatusSchema,
    { artifactName: "project status" }
  );

  if (!status.ok) return status;

  const nextStatus: ProjectStatus = {
    ...status.value,
    activeFeatureId: input.featureId,
    activeFeatureSlug: input.featureSlug,
    activeFeaturePath: input.featurePath,
    activeTaskId: input.task.id,
    currentState: "verified",
    lastCommand: "verify",
    updatedAt: input.now
  };

  if (input.dryRun) return ok(undefined);

  const graphWrite = await writeArtifact(
    taskGraphArtifactPath(input.targetPath, input.featureKey),
    taskGraphArtifactSchema,
    updatedGraph,
    { artifactName: "task graph" }
  );

  if (!graphWrite.ok) return graphWrite;

  return writeArtifact(
    projectStatusArtifactPath(input.targetPath),
    projectStatusSchema,
    nextStatus,
    { artifactName: "project status" }
  ).then((result) => (result.ok ? ok(undefined) : result));
}

export async function runVerifyWorkflow(
  options: VerifyWorkflowOptions = {}
): Promise<Result<VerifySummary, VispError>> {
  const cwd = options.cwd ?? process.cwd();
  const targetPath = path.resolve(cwd, options.targetPath ?? ".");
  const dryRun = options.dryRun ?? false;
  const startedAt = options.now ?? new Date().toISOString();
  const startMs = Date.now();

  if (options.targeted && options.all) {
    return err(new VispError("VALIDATION_FAILED", "Use either --targeted or --all, not both."));
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

  const taskSelector = await selectedTaskFromStatus({
    targetPath,
    taskId: options.taskId
  });

  if (!taskSelector.ok) return taskSelector;

  const task =
    taskSelector.value === undefined
      ? undefined
      : selectTaskById(taskGraph.value, taskSelector.value);

  if (task !== undefined && !task.ok) return task;

  const selectedTask = task?.value;
  const warnings: string[] = [];
  const policyGateResult = await evaluatePolicyGate({
    targetPath,
    stage: "verify",
    feature: feature.value.key,
    taskId: selectedTask?.id,
    now: startedAt
  });
  const policyGate = policyGateResult.ok ? policyGateResult.value : undefined;
  const policyGateUnavailable = policyGateResult.ok
    ? undefined
    : `Verification gate evaluation unavailable: ${policyGateResult.error.message}`;
  if (selectedTask !== undefined) {
    const checklistSummary = await getImplementationChecklistSummary({
      targetPath,
      featureKey: feature.value.key,
      taskId: selectedTask.id
    });

    if (checklistSummary.ok) {
      warnings.push(implementationChecklistStatusLine(checklistSummary.value));
    } else {
      warnings.push(
        `Implementation checklist status unavailable: ${checklistSummary.error.message}`
      );
    }
  }

  const checks = checksFromOptions(options);
  const spec = await optionalArtifact({
    path: specArtifactPath(targetPath, feature.value.key),
    schema: specArtifactSchema,
    artifactName: "spec",
    warnings
  });
  const plan = await optionalArtifact({
    path: planArtifactPath(targetPath, feature.value.key),
    schema: planDraftArtifactSchema,
    artifactName: "plan",
    warnings
  });
  const traceability = await optionalArtifact({
    path: traceabilityArtifactPath(targetPath, feature.value.key),
    schema: traceabilityMatrixSchema,
    artifactName: "traceability",
    warnings
  });
  const project = await optionalArtifact({
    path: projectProfileArtifactPath(targetPath),
    schema: projectProfileSchema,
    artifactName: "project profile",
    warnings
  });
  const contextPack =
    selectedTask === undefined
      ? undefined
      : await optionalArtifact<ContextPack>({
          path: contextPackArtifactPath(targetPath, feature.value.key, selectedTask.id),
          schema: contextPackSchema,
          artifactName: "context pack",
          warnings
        });
  const artifactValidation = checks.artifacts
    ? await validateArtifacts({
        targetPath,
        featureKey: feature.value.key,
        taskId: selectedTask?.id
      })
    : skippedArtifacts();
  const traceabilityValidation = checks.traceability
    ? validateTraceability({
        taskGraph: taskGraph.value,
        task: selectedTask,
        spec,
        traceability,
        explicit: options.traceability === true
      })
    : skippedTraceability(selectedTask?.id);
  const commandSelection = checks.commands
    ? selectValidationCommands({
        mode: commandMode({
          task: selectedTask,
          all: options.all,
          targeted: options.targeted
        }),
        task: selectedTask,
        contextPack,
        project
      })
    : { commands: [], warnings: [] };
  const commandResults = checks.commands
    ? await runVerificationCommands({
        targetPath,
        commands: commandSelection.commands,
        dryRun,
        commandRunner: options.commandRunner,
        jsonOutput: options.jsonOutput
      })
    : [];
  const commandValidation = checks.commands
    ? commandSection({
        results: commandResults,
        warnings: commandSelection.warnings
      })
    : skippedCommands(
        options.skipCommands
          ? "Command execution skipped by --skip-commands."
          : "Command execution not selected."
      );
  const git =
    checks.scope || checks.dependencies
      ? await getGitChangedFiles({
          targetPath,
          base: options.base,
          commandRunner: options.commandRunner
        })
      : { changedFiles: [], warnings: [], errors: [] };
  const scopeValidation = checks.scope
    ? validateScope({
        changedFiles: git.changedFiles,
        task: selectedTask,
        taskGraph: taskGraph.value,
        explicit: options.scope === true,
        gitWarnings: git.warnings
      })
    : skippedScope();
  const dependencyValidation = checks.dependencies
    ? validateDependencies({
        changedFiles: git.changedFiles,
        task: selectedTask,
        plan
      })
    : skippedDependencies();
  const endedAt = new Date().toISOString();
  const baseReport: Omit<VerificationReport, "summary"> = {
    id: `VER-${feature.value.id}-${selectedTask?.id ?? "feature"}`,
    featureId: feature.value.id,
    featureSlug: feature.value.slug,
    taskId: selectedTask?.id ?? null,
    mode: reportMode({ checks, all: options.all, task: selectedTask }),
    startedAt,
    endedAt,
    durationMs: Math.max(0, Date.now() - startMs),
    success: false,
    artifactValidation,
    traceabilityValidation,
    commandValidation,
    scopeValidation,
    dependencyValidation,
    policyGate,
    warnings,
    errors: policyGateUnavailable === undefined ? [] : [policyGateUnavailable],
    nextCommand: "pending"
  };
  const gateBlocks =
    policyGate === undefined
      ? policyGateUnavailable !== undefined
      : gateBlocksWorkflow({ gate: policyGate, force: options.force });
  const gateMessages = policyGate === undefined ? [] : gateFailureMessages(policyGate);
  const gateWarnings =
    policyGate === undefined ? [] : gateBlocks ? [] : gateWarningMessages(policyGate);
  const collectedWarnings = [
    ...new Set([...warnings, ...gateWarnings, ...collectWarnings(baseReport)])
  ];
  const collectedErrors = [
    ...new Set([...collectErrors(baseReport), ...(gateBlocks ? gateMessages : [])])
  ];
  const nextCommand =
    collectedErrors.length === 0
      ? "visp review --diff-only"
      : selectedTask === undefined
        ? "visp verify"
        : `visp verify --task ${selectedTask.id}`;
  const withMessages: Omit<VerificationReport, "summary"> = {
    ...baseReport,
    success: collectedErrors.length === 0,
    warnings: collectedWarnings,
    errors: collectedErrors,
    nextCommand
  };
  const summary = createVerificationSummary(withMessages);
  const report: VerificationReport = {
    ...withMessages,
    success: summary.passed,
    summary
  };
  const parsed = verificationReportSchema.safeParse(report);

  if (!parsed.success) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Generated verification report is invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}`
      )
    );
  }

  const reportJsonPath = verificationArtifactPath(targetPath, feature.value.key);
  const reportMarkdownPath = verificationMarkdownPath(targetPath, feature.value.key);
  const reportPath = relativePath(targetPath, reportMarkdownPath);

  if (!dryRun) {
    const writeJson = await writeArtifact(reportJsonPath, verificationReportSchema, parsed.data, {
      artifactName: "verification report"
    });

    if (!writeJson.ok) return writeJson;

    const writeMarkdown = await writeTextFile(
      reportMarkdownPath,
      renderVerificationMarkdown(parsed.data)
    );

    if (!writeMarkdown.ok) return writeMarkdown;
  }

  if (options.updateTaskStatus && selectedTask !== undefined && parsed.data.success) {
    const update = await updateTaskStatus({
      targetPath,
      featureKey: feature.value.key,
      featureId: feature.value.id,
      featureSlug: feature.value.slug,
      featurePath: feature.value.relativePath,
      taskGraph: taskGraph.value,
      task: selectedTask,
      now: endedAt,
      dryRun
    });

    if (!update.ok) return update;
  }

  if (selectedTask !== undefined && parsed.data.success) {
    const checklist = await markImplementationChecklistSteps({
      targetPath,
      featureKey: feature.value.key,
      taskId: selectedTask.id,
      steps: ["verify"],
      dryRun
    });

    if (!checklist.ok) return checklist;
  }

  const budgetRefresh = await refreshBudgetReport({
    targetPath,
    feature: feature.value.key,
    taskId: selectedTask?.id,
    dryRun,
    now: endedAt
  });
  const timeline = await refreshFeatureTimeline({
    targetPath,
    feature: feature.value.key,
    taskId: selectedTask?.id,
    dryRun,
    now: endedAt
  });
  const writtenFiles = dryRun
    ? []
    : [
        relativePath(targetPath, reportJsonPath),
        reportPath,
        ...budgetRefresh.writtenFiles,
        ...timeline.writtenFiles
      ];
  const run = await recordWorkflowRun({
    targetPath,
    command: "verify",
    startedAt,
    endedAt,
    feature: {
      id: feature.value.id,
      slug: feature.value.slug
    },
    taskId: selectedTask?.id,
    success: parsed.data.success,
    result: parsed.data.success
      ? parsed.data.warnings.length > 0
        ? "warnings"
        : "passed"
      : "failed",
    actions: writtenFiles.map((filePath) => ({
      path: filePath,
      action: "updated" as const
    })),
    warnings: [...parsed.data.warnings, ...budgetRefresh.warnings, ...timeline.warnings],
    errors: parsed.data.errors,
    events: [
      {
        type: "evidence_recorded",
        message: `Verification ${parsed.data.success ? "passed" : "failed"}.`,
        artifactPath: reportPath
      }
    ],
    dryRun
  });

  return ok({
    success: parsed.data.success || dryRun,
    targetPath,
    feature: {
      id: feature.value.id,
      slug: feature.value.slug
    },
    taskId: selectedTask?.id ?? null,
    mode: parsed.data.mode,
    summary: {
      artifacts: parsed.data.artifactValidation.status,
      traceability: parsed.data.traceabilityValidation.status,
      commands: parsed.data.commandValidation.status,
      scope: parsed.data.scopeValidation.status,
      dependencies: parsed.data.dependencyValidation.status
    },
    commands: parsed.data.commandValidation.commands.map((command) => ({
      command: command.command,
      exitCode: command.exitCode,
      success: command.success,
      durationMs: command.durationMs,
      skipped: command.skipped,
      skipReason: command.skipReason,
      runner: command.runner
    })),
    reportPath: dryRun ? null : reportPath,
    warnings: [
      ...new Set([
        ...parsed.data.warnings,
        ...budgetRefresh.warnings,
        ...timeline.warnings,
        ...run.warnings
      ])
    ],
    errors: parsed.data.errors,
    nextCommand: parsed.data.nextCommand,
    dryRun
  });
}

export { formatVerifySummary };
