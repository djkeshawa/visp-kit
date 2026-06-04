import path from "node:path";
import { type ZodType } from "zod";

import {
  contextPackArtifactPath,
  contextPackMarkdownPath,
  featureReconcileArtifactPath,
  featureReconcileMarkdownPath,
  featureReconcilePromptPath,
  featureReviewArtifactPath,
  featureReviewMarkdownPath,
  planArtifactPath,
  projectStatusArtifactPath,
  promptArtifactPath,
  specMarkdownPath,
  specArtifactPath,
  taskGraphArtifactPath,
  taskReconcileArtifactPath,
  taskReconcileMarkdownPath,
  taskReconcilePromptPath,
  taskReviewArtifactPath,
  taskReviewMarkdownPath,
  tasksMarkdownPath,
  traceabilityArtifactPath,
  traceabilityMarkdownPath,
  verificationArtifactPath,
  verificationMarkdownPath,
  planMarkdownPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import { contextPackSchema, type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
import { planDraftArtifactSchema, type PlanDraftArtifact } from "../artifacts/schemas/plan.schema.js";
import {
  projectStatusSchema,
  type ProjectStatus
} from "../artifacts/schemas/project.schema.js";
import {
  reconcileReportSchema,
  type ReconcileReport,
  type ReconcileResult,
  type TraceabilityUpdate
} from "../artifacts/schemas/reconcile.schema.js";
import { reviewReportSchema, type ReviewReport } from "../artifacts/schemas/review.schema.js";
import { specArtifactSchema, type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import {
  taskGraphArtifactSchema,
  type Task,
  type TaskGraphArtifact
} from "../artifacts/schemas/task.schema.js";
import {
  traceabilityMatrixSchema,
  type TraceabilityMatrix
} from "../artifacts/schemas/traceability.schema.js";
import { verificationReportSchema, type VerificationReport } from "../artifacts/schemas/verification.schema.js";
import { type CommandRunner } from "../core/command-runner.js";
import { VispError } from "../core/errors.js";
import { pathExists, writeTextFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { selectTaskById } from "../context/task-selector.js";
import { followUpSuggestions } from "../reconcile/follow-up-tasks.js";
import { reconcileDiff } from "../reconcile/reconcile-diff.js";
import {
  reconcileDependencies,
  reconcileRequirementCoverage,
  reconcileTaskAlignment
} from "../reconcile/reconcile-drift.js";
import {
  reconcileReviewEvidence,
  reconcileVerificationEvidence
} from "../reconcile/reconcile-evidence.js";
import {
  numberReconcileFindings,
  reconcileFinding,
  type ReconcileFindingDraft
} from "../reconcile/reconcile-findings.js";
import { renderReconcilePrompt } from "../reconcile/reconcile-prompt.js";
import { renderReconcileMarkdown } from "../reconcile/reconcile-report.js";
import {
  formatReconcileSummary,
  reconcileSummaryFromReport,
  type ReconcileSummary
} from "../reconcile/reconcile-summary.js";
import {
  renderTraceabilityMarkdown,
  updateTraceabilityForReconcile
} from "../reconcile/reconcile-traceability.js";
import { loadGitDiff } from "../review/diff-loader.js";
import {
  evaluatePolicyGate,
  gateBlocksWorkflow,
  gateFailureMessages,
  gateWarningMessages
} from "../gates/policy-gate-summary.js";
import { resolveActiveFeature } from "./shared/active-feature.js";
import { loadTaskGraph } from "./shared/task-graph-loader.js";

export type ReconcileWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly staged?: boolean;
  readonly unstaged?: boolean;
  readonly base?: string;
  readonly updateTraceability?: boolean;
  readonly updateTaskStatus?: boolean;
  readonly promptOnly?: boolean;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
  readonly now?: string;
  readonly commandRunner?: CommandRunner;
};

async function optionalArtifact<T>(input: {
  readonly path: string;
  readonly schema: ZodType<T>;
  readonly artifactName: string;
  readonly warnings: string[];
  readonly warnOnMissing?: boolean;
}): Promise<T | undefined> {
  const exists = await pathExists(input.path);

  if (!exists.ok || !exists.value) {
    if (input.warnOnMissing ?? true) {
      input.warnings.push(`Optional artifact missing: ${input.artifactName}.`);
    }

    return undefined;
  }

  const artifact = await readArtifact(input.path, input.schema, {
    artifactName: input.artifactName
  });

  if (!artifact.ok) {
    input.warnings.push(`Optional artifact unreadable: ${input.artifactName}. ${artifact.error.message}`);
    return undefined;
  }

  return artifact.value;
}

async function ensureTaskGraph(input: {
  readonly targetPath: string;
  readonly featureKey: string;
}): Promise<Result<void, VispError>> {
  const exists = await pathExists(taskGraphArtifactPath(input.targetPath, input.featureKey));

  if (!exists.ok) return exists;
  if (!exists.value) {
    return err(new VispError("VALIDATION_FAILED", "Task graph is missing. Run `visp tasks` first."));
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

function outputPaths(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly task?: Task;
}): {
  readonly reportJsonPath: string;
  readonly reportMarkdownPath: string;
  readonly promptPath: string;
  readonly currentPromptPath: string;
  readonly reportRelative: string;
  readonly promptRelative: string;
  readonly contextRelative: string | null;
  readonly verificationRelative: string;
  readonly reviewRelative: string;
  readonly specRelative: string;
  readonly planRelative: string;
  readonly tasksRelative: string;
} {
  const reportJsonPath =
    input.task === undefined
      ? featureReconcileArtifactPath(input.targetPath, input.featureKey)
      : taskReconcileArtifactPath(input.targetPath, input.featureKey, input.task.id);
  const reportMarkdownPath =
    input.task === undefined
      ? featureReconcileMarkdownPath(input.targetPath, input.featureKey)
      : taskReconcileMarkdownPath(input.targetPath, input.featureKey, input.task.id);
  const promptPath =
    input.task === undefined
      ? featureReconcilePromptPath(input.targetPath, input.featureKey)
      : taskReconcilePromptPath(input.targetPath, input.featureKey, input.task.id);

  return {
    reportJsonPath,
    reportMarkdownPath,
    promptPath,
    currentPromptPath: promptArtifactPath(input.targetPath, "reconcile"),
    reportRelative: relativePath(input.targetPath, reportMarkdownPath),
    promptRelative: relativePath(input.targetPath, promptPath),
    contextRelative:
      input.task === undefined
        ? null
        : relativePath(input.targetPath, contextPackMarkdownPath(input.targetPath, input.featureKey, input.task.id)),
    verificationRelative: relativePath(input.targetPath, verificationMarkdownPath(input.targetPath, input.featureKey)),
    reviewRelative:
      input.task === undefined
        ? relativePath(input.targetPath, featureReviewMarkdownPath(input.targetPath, input.featureKey))
        : relativePath(input.targetPath, taskReviewMarkdownPath(input.targetPath, input.featureKey, input.task.id)),
    specRelative: relativePath(input.targetPath, specMarkdownPath(input.targetPath, input.featureKey)),
    planRelative: relativePath(input.targetPath, planMarkdownPath(input.targetPath, input.featureKey)),
    tasksRelative: relativePath(input.targetPath, tasksMarkdownPath(input.targetPath, input.featureKey))
  };
}

function resultFromFindings(findings: readonly { severity: string }[]): ReconcileResult {
  if (findings.some((finding) => finding.severity === "error")) return "failed";
  if (findings.some((finding) => finding.severity === "warning")) return "warnings";
  return "passed";
}

function nextCommand(report: Pick<ReconcileReport, "result" | "taskId" | "traceabilityUpdate">): string {
  const taskFlag = report.taskId === null ? "" : ` --task ${report.taskId}`;

  if (report.result === "failed") {
    return `visp verify${taskFlag}`;
  }

  if (!report.traceabilityUpdate.performed) {
    return `visp reconcile${taskFlag} --update-traceability`;
  }

  return "visp next";
}

function traceabilityUpdateState(input: {
  readonly requested: boolean;
  readonly result: ReconcileResult;
  readonly promptOnly: boolean;
  readonly dryRun: boolean;
  readonly traceability?: TraceabilityMatrix;
}): TraceabilityUpdate {
  if (!input.requested) {
    return {
      requested: false,
      performed: false,
      updatedFiles: [],
      skippedReason: "not requested"
    };
  }

  if (input.result === "failed") {
    return {
      requested: true,
      performed: false,
      updatedFiles: [],
      skippedReason: "reconciliation has blocking errors"
    };
  }

  if (input.promptOnly) {
    return {
      requested: true,
      performed: false,
      updatedFiles: [],
      skippedReason: "prompt-only mode"
    };
  }

  if (input.dryRun) {
    return {
      requested: true,
      performed: false,
      updatedFiles: [],
      skippedReason: "dry-run"
    };
  }

  if (input.traceability === undefined) {
    return {
      requested: true,
      performed: false,
      updatedFiles: [],
      skippedReason: "traceability artifact missing"
    };
  }

  return {
    requested: true,
    performed: true,
    updatedFiles: [],
    skippedReason: null
  };
}

function collectWarnings(...sections: Array<{ warnings: readonly string[] }>): readonly string[] {
  return [...new Set(sections.flatMap((section) => section.warnings))];
}

function collectErrors(...sections: Array<{ errors: readonly string[] }>): readonly string[] {
  return [...new Set(sections.flatMap((section) => section.errors))];
}

async function updateStatus(input: {
  readonly targetPath: string;
  readonly featureId: string;
  readonly featureSlug: string;
  readonly featurePath: string;
  readonly task?: Task;
  readonly result: ReconcileResult;
  readonly now: string;
}): Promise<Result<void, VispError>> {
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
    activeTaskId: input.task?.id ?? status.value.activeTaskId ?? null,
    currentState: input.result === "passed" ? "reconciled" : "reconcile_ready",
    lastCommand: "reconcile",
    updatedAt: input.now
  };

  const write = await writeArtifact(
    projectStatusArtifactPath(input.targetPath),
    projectStatusSchema,
    nextStatus,
    { artifactName: "project status" }
  );

  if (!write.ok) return write;
  return ok(undefined);
}

async function updateTaskStatus(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly taskGraph: TaskGraphArtifact;
  readonly task: Task;
  readonly result: ReconcileResult;
  readonly force: boolean;
  readonly verificationPassed: boolean;
  readonly now: string;
}): Promise<Result<void, VispError>> {
  if (input.result === "failed") return ok(undefined);
  if (input.result === "warnings" && !input.force) return ok(undefined);

  const nextStatus = input.verificationPassed ? "verified" : "done";
  const nextGraph: TaskGraphArtifact = {
    ...input.taskGraph,
    tasks: input.taskGraph.tasks.map((task) =>
      task.id === input.task.id ? { ...task, status: nextStatus } : task
    ),
    updatedAt: input.now
  };

  const write = await writeArtifact(
    taskGraphArtifactPath(input.targetPath, input.featureKey),
    taskGraphArtifactSchema,
    nextGraph,
    { artifactName: "task graph" }
  );

  if (!write.ok) return write;
  return ok(undefined);
}

export async function runReconcileWorkflow(
  options: ReconcileWorkflowOptions = {}
): Promise<Result<ReconcileSummary, VispError>> {
  const cwd = options.cwd ?? process.cwd();
  const targetPath = path.resolve(cwd, options.targetPath ?? ".");
  const startedAt = options.now ?? new Date().toISOString();
  const startMs = Date.now();
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;
  const optionalWarnings: string[] = [];
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
  const policyGateResult = await evaluatePolicyGate({
    targetPath,
    stage: "reconcile",
    feature: feature.value.key,
    taskId: selectedTask?.id,
    now: startedAt
  });
  const policyGate = policyGateResult.ok ? policyGateResult.value : undefined;

  if (!policyGateResult.ok) {
    optionalWarnings.push(`Reconcile gate could not be evaluated: ${policyGateResult.error.message}`);
  }

  const paths = outputPaths({
    targetPath,
    featureKey: feature.value.key,
    task: selectedTask
  });
  const spec = await optionalArtifact({
    path: specArtifactPath(targetPath, feature.value.key),
    schema: specArtifactSchema,
    artifactName: "spec",
    warnings: optionalWarnings
  });
  const plan = await optionalArtifact({
    path: planArtifactPath(targetPath, feature.value.key),
    schema: planDraftArtifactSchema,
    artifactName: "plan",
    warnings: optionalWarnings
  });
  const traceability = await optionalArtifact({
    path: traceabilityArtifactPath(targetPath, feature.value.key),
    schema: traceabilityMatrixSchema,
    artifactName: "traceability",
    warnings: optionalWarnings
  });
  const contextPack =
    selectedTask === undefined
      ? undefined
      : await optionalArtifact({
          path: contextPackArtifactPath(targetPath, feature.value.key, selectedTask.id),
          schema: contextPackSchema,
          artifactName: "context pack",
          warnings: optionalWarnings
        });
  const verification = await optionalArtifact({
    path: verificationArtifactPath(targetPath, feature.value.key),
    schema: verificationReportSchema,
    artifactName: "verification report",
    warnings: optionalWarnings,
    warnOnMissing: false
  });
  const review = await optionalArtifact({
    path:
      selectedTask === undefined
        ? featureReviewArtifactPath(targetPath, feature.value.key)
        : taskReviewArtifactPath(targetPath, feature.value.key, selectedTask.id),
    schema: reviewReportSchema,
    artifactName: "review report",
    warnings: optionalWarnings,
    warnOnMissing: false
  });
  const diff = await loadGitDiff({
    targetPath,
    staged: options.staged,
    unstaged: options.unstaged,
    base: options.base,
    commandRunner: options.commandRunner
  });

  if (!diff.ok) return diff;

  const mapped = reconcileDiff({
    files: diff.value.files,
    task: selectedTask,
    taskGraph: taskGraph.value,
    traceability: traceability as TraceabilityMatrix | undefined
  });
  const verificationEvidence = reconcileVerificationEvidence({
    verification: verification as VerificationReport | undefined,
    task: selectedTask,
    reportPath: paths.verificationRelative,
    force
  });
  const reviewEvidence = reconcileReviewEvidence({
    review: review as ReviewReport | undefined,
    task: selectedTask,
    reportPath: paths.reviewRelative,
    force
  });
  const alignment = reconcileTaskAlignment({
    task: selectedTask,
    changedFiles: mapped.changedFiles,
    contextPackFound: contextPack !== undefined || selectedTask === undefined,
    validationEvidenceFound: Boolean(
      selectedTask?.validationCommands.length ||
        (contextPack as ContextPack | undefined)?.validationCommands.length ||
        verification !== undefined
    )
  });
  const coverage = reconcileRequirementCoverage({
    task: selectedTask,
    taskGraph: taskGraph.value,
    spec: spec as SpecArtifact | undefined,
    traceability: traceability as TraceabilityMatrix | undefined,
    changedFiles: mapped.changedFiles
  });
  const dependencies = reconcileDependencies({
    changedFiles: mapped.changedFiles,
    task: selectedTask,
    plan: plan as PlanDraftArtifact | undefined
  });
  const gateBlocks = policyGate === undefined
    ? false
    : gateBlocksWorkflow({ gate: policyGate, force });
  const gateFindingSeverity = gateBlocks ? "error" : "warning";
  const gateFindings: ReconcileFindingDraft[] = policyGate === undefined
    ? []
    : policyGate.failedRules.map((rule) =>
        reconcileFinding({
          category: "review",
          severity: gateFindingSeverity,
          driftType: "manual_review_needed",
          title: `Policy gate ${rule.ruleId} did not pass`,
          description: rule.message,
          evidence: rule.evidence,
          recommendation: rule.recommendation,
          relatedTaskId: selectedTask?.id ?? null
        })
      );
  const findingDrafts: ReconcileFindingDraft[] = [
    ...gateFindings,
    ...mapped.findings,
    ...verificationEvidence.findings,
    ...reviewEvidence.findings,
    ...alignment.findings,
    ...coverage.findings,
    ...dependencies.findings
  ];
  const findings = numberReconcileFindings(findingDrafts);
  const result = resultFromFindings(findings);
  const traceUpdate = traceabilityUpdateState({
    requested: options.updateTraceability ?? false,
    result,
    promptOnly: options.promptOnly ?? false,
    dryRun,
    traceability: traceability as TraceabilityMatrix | undefined
  });
  const traceabilityUpdate: TraceabilityUpdate = traceUpdate.performed
    ? {
        ...traceUpdate,
        updatedFiles: [
          relativePath(targetPath, traceabilityArtifactPath(targetPath, feature.value.key)),
          relativePath(targetPath, traceabilityMarkdownPath(targetPath, feature.value.key))
        ]
      }
    : traceUpdate;
  const endedAt = new Date().toISOString();
  const warnings = collectWarnings(
    { warnings: optionalWarnings },
    mapped.fileMapping,
    verificationEvidence.evidence,
    reviewEvidence.evidence,
    alignment.taskAlignment,
    coverage.requirementCoverage,
    dependencies.dependencyEvidence,
    { warnings: policyGate === undefined || gateBlocks ? [] : gateWarningMessages(policyGate) }
  );
  const errors = collectErrors(
    mapped.fileMapping,
    verificationEvidence.evidence,
    reviewEvidence.evidence,
    alignment.taskAlignment,
    coverage.requirementCoverage,
    dependencies.dependencyEvidence,
    { errors: policyGate === undefined || !gateBlocks ? [] : gateFailureMessages(policyGate) }
  );
  const baseReport = {
    id: `REC-${feature.value.id}-${selectedTask?.id ?? "feature"}`,
    featureId: feature.value.id,
    featureSlug: feature.value.slug,
    taskId: selectedTask?.id ?? null,
    mode: options.promptOnly ? "prompt-only" : selectedTask === undefined ? "feature" : "task",
    startedAt,
    endedAt,
    durationMs: Math.max(0, Date.now() - startMs),
    success: result !== "failed",
    result,
    changedFiles: mapped.changedFiles,
    taskAlignment: alignment.taskAlignment,
    requirementCoverage: coverage.requirementCoverage,
    fileMapping: mapped.fileMapping,
    verificationEvidence: verificationEvidence.evidence,
    reviewEvidence: reviewEvidence.evidence,
    dependencyEvidence: dependencies.dependencyEvidence,
    policyGate,
    traceabilityUpdate,
    findings,
    followUpSuggestions: [],
    warnings,
    errors,
    reportPath: options.promptOnly ? null : paths.reportRelative,
    promptPath: paths.promptRelative,
    nextCommand: "pending"
  };
  const report = {
    ...baseReport,
    followUpSuggestions: followUpSuggestions({
      changedFiles: baseReport.changedFiles,
      findings: baseReport.findings,
      taskId: baseReport.taskId
    }),
    nextCommand: nextCommand(baseReport)
  };
  const parsed = reconcileReportSchema.safeParse(report);

  if (!parsed.success) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Generated reconciliation report is invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}`
      )
    );
  }

  if (!dryRun) {
    const prompt = renderReconcilePrompt({
      report: parsed.data,
      taskTitle: selectedTask?.title,
      paths: [
        paths.specRelative,
        paths.planRelative,
        paths.tasksRelative,
        paths.contextRelative,
        paths.verificationRelative,
        paths.reviewRelative,
        parsed.data.reportPath
      ]
    });

    if (!options.promptOnly) {
      const writeJson = await writeArtifact(
        paths.reportJsonPath,
        reconcileReportSchema,
        parsed.data,
        { artifactName: "reconciliation report" }
      );

      if (!writeJson.ok) return writeJson;

      const writeMarkdown = await writeTextFile(
        paths.reportMarkdownPath,
        renderReconcileMarkdown(parsed.data)
      );

      if (!writeMarkdown.ok) return writeMarkdown;
    }

    const writePrompt = await writeTextFile(paths.promptPath, prompt);

    if (!writePrompt.ok) return writePrompt;

    const writeCurrentPrompt = await writeTextFile(paths.currentPromptPath, prompt);

    if (!writeCurrentPrompt.ok) return writeCurrentPrompt;

    if (parsed.data.traceabilityUpdate.performed && traceability !== undefined) {
      const nextTraceability = updateTraceabilityForReconcile({
        traceability: traceability as TraceabilityMatrix,
        task: selectedTask,
        changedFiles: parsed.data.changedFiles,
        result: parsed.data.result,
        now: endedAt
      });
      const writeTrace = await writeArtifact(
        traceabilityArtifactPath(targetPath, feature.value.key),
        traceabilityMatrixSchema,
        nextTraceability,
        { artifactName: "traceability" }
      );

      if (!writeTrace.ok) return writeTrace;

      const writeTraceMarkdown = await writeTextFile(
        traceabilityMarkdownPath(targetPath, feature.value.key),
        renderTraceabilityMarkdown(nextTraceability)
      );

      if (!writeTraceMarkdown.ok) return writeTraceMarkdown;
    }

    if (!options.promptOnly && options.updateTaskStatus && selectedTask !== undefined) {
      const update = await updateTaskStatus({
        targetPath,
        featureKey: feature.value.key,
        taskGraph: taskGraph.value,
        task: selectedTask,
        result: parsed.data.result,
        force,
        verificationPassed: verificationEvidence.evidence.passed === true,
        now: endedAt
      });

      if (!update.ok) return update;
    }

    if (!options.promptOnly) {
      const status = await updateStatus({
        targetPath,
        featureId: feature.value.id,
        featureSlug: feature.value.slug,
        featurePath: feature.value.relativePath,
        task: selectedTask,
        result: parsed.data.result,
        now: endedAt
      });

      if (!status.ok) return status;
    }
  }

  return ok(
    reconcileSummaryFromReport({
      report: parsed.data,
      targetPath,
      dryRun
    })
  );
}

export { formatReconcileSummary };
