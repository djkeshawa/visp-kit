import path from "node:path";
import { type ZodType } from "zod";

import {
  contextPackArtifactPath,
  contextPackMarkdownPath,
  featureReviewArtifactPath,
  featureReviewChecklistPath,
  featureReviewMarkdownPath,
  featureReviewPromptPath,
  planArtifactPath,
  projectProfileArtifactPath,
  projectStatusArtifactPath,
  promptArtifactPath,
  specArtifactPath,
  taskGraphArtifactPath,
  taskReviewArtifactPath,
  taskReviewChecklistPath,
  taskReviewMarkdownPath,
  taskReviewPromptPath,
  traceabilityArtifactPath,
  verificationArtifactPath,
  verificationMarkdownPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import { contextPackSchema, type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
import {
  planDraftArtifactSchema,
  type PlanDraftArtifact
} from "../artifacts/schemas/plan.schema.js";
import {
  projectProfileSchema,
  projectStatusSchema,
  type ProjectProfile,
  type ProjectStatus
} from "../artifacts/schemas/project.schema.js";
import {
  reviewReportSchema,
  type ReviewMode,
  type ReviewReport
} from "../artifacts/schemas/review.schema.js";
import { specArtifactSchema, type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import {
  traceabilityMatrixSchema,
  type TraceabilityMatrix
} from "../artifacts/schemas/traceability.schema.js";
import {
  verificationReportSchema,
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
import { reviewDependencies } from "../review/dependency-review.js";
import { loadGitDiff } from "../review/diff-loader.js";
import { summarizeDiff } from "../review/diff-summary.js";
import { reviewDocumentation } from "../review/documentation-review.js";
import { finding, numberFindings, type ReviewFindingDraft } from "../review/review-findings.js";
import { renderReviewChecklist } from "../review/review-checklist.js";
import { renderReviewMarkdown } from "../review/review-report.js";
import { renderReviewPrompt } from "../review/review-prompt.js";
import {
  formatReviewSummary,
  reviewSummaryFromReport,
  type ReviewSummary
} from "../review/review-summary.js";
import { reviewScope } from "../review/review-scope.js";
import { securityChecklist } from "../review/security-checklist.js";
import { reviewTestSignals } from "../review/test-signal-review.js";
import { reviewTraceability } from "../review/traceability-review.js";
import { reviewVerification } from "../review/verification-review.js";
import {
  evaluatePolicyGate,
  gateBlocksWorkflow,
  gateFailureMessages,
  gateWarningMessages
} from "../gates/policy-gate-summary.js";
import { resolveActiveFeature } from "./shared/active-feature.js";
import { refreshBudgetReport } from "./shared/budget-refresh.js";
import { loadTaskGraph } from "./shared/task-graph-loader.js";
import { recordWorkflowRun } from "./shared/run-recorder.js";
import { refreshFeatureTimeline } from "./shared/timeline-refresh.js";
import { taskImplementMarkerPath } from "../gates/implement-marker.js";
import { implementMarkerSchema } from "../artifacts/schemas/implement-marker.schema.js";

export type ReviewWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly diffOnly?: boolean;
  readonly staged?: boolean;
  readonly unstaged?: boolean;
  readonly base?: string;
  readonly promptOnly?: boolean;
  readonly checklistOnly?: boolean;
  readonly skipVerification?: boolean;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly now?: string;
  readonly commandRunner?: CommandRunner;
};

async function ensureTaskGraph(input: {
  readonly targetPath: string;
  readonly featureKey: string;
}): Promise<Result<void, VispError>> {
  const exists = await pathExists(taskGraphArtifactPath(input.targetPath, input.featureKey));

  if (!exists.ok) return exists;
  if (!exists.value) {
    return err(
      new VispError("VALIDATION_FAILED", "Task graph is missing. Run `visp tasks` first.")
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
    input.warnings.push(
      `Optional artifact unreadable: ${input.artifactName}. ${artifact.error.message}`
    );
    return undefined;
  }

  return artifact.value;
}

function reviewMode(options: ReviewWorkflowOptions, task?: Task): ReviewMode {
  if (options.promptOnly) return "prompt-only";
  if (options.checklistOnly) return "checklist-only";
  if (options.diffOnly) return "diff-only";
  return task === undefined ? "feature" : "task";
}

function resultFromFindings(
  findings: readonly { severity: string }[]
): "passed" | "warnings" | "failed" {
  if (findings.some((finding) => finding.severity === "error")) return "failed";
  if (findings.some((finding) => finding.severity === "warning")) return "warnings";
  return "passed";
}

function collectMessages(input: {
  readonly optionalWarnings: readonly string[];
  readonly sections: readonly {
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
  }[];
}): {
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
} {
  return {
    warnings: [
      ...new Set([
        ...input.optionalWarnings,
        ...input.sections.flatMap((section) => section.warnings)
      ])
    ],
    errors: [...new Set(input.sections.flatMap((section) => section.errors))]
  };
}

function nextCommand(report: Pick<ReviewReport, "result" | "taskId">): string {
  if (report.result === "failed") {
    return report.taskId === null ? "visp verify" : `visp verify --task ${report.taskId}`;
  }

  return report.taskId === null ? "visp reconcile" : `visp reconcile --task ${report.taskId}`;
}

function outputPaths(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly task?: Task;
}): {
  readonly reportJsonPath: string;
  readonly reportMarkdownPath: string;
  readonly promptPath: string;
  readonly checklistPath: string;
  readonly currentPromptPath: string;
  readonly reportPathRelative: string;
  readonly promptPathRelative: string;
  readonly checklistPathRelative: string;
  readonly contextPathRelative: string | null;
  readonly verificationPathRelative: string;
} {
  const reportJsonPath =
    input.task === undefined
      ? featureReviewArtifactPath(input.targetPath, input.featureKey)
      : taskReviewArtifactPath(input.targetPath, input.featureKey, input.task.id);
  const reportMarkdownPath =
    input.task === undefined
      ? featureReviewMarkdownPath(input.targetPath, input.featureKey)
      : taskReviewMarkdownPath(input.targetPath, input.featureKey, input.task.id);
  const promptPath =
    input.task === undefined
      ? featureReviewPromptPath(input.targetPath, input.featureKey)
      : taskReviewPromptPath(input.targetPath, input.featureKey, input.task.id);
  const checklistPath =
    input.task === undefined
      ? featureReviewChecklistPath(input.targetPath, input.featureKey)
      : taskReviewChecklistPath(input.targetPath, input.featureKey, input.task.id);

  return {
    reportJsonPath,
    reportMarkdownPath,
    promptPath,
    checklistPath,
    currentPromptPath: promptArtifactPath(input.targetPath, "review"),
    reportPathRelative: relativePath(input.targetPath, reportMarkdownPath),
    promptPathRelative: relativePath(input.targetPath, promptPath),
    checklistPathRelative: relativePath(input.targetPath, checklistPath),
    contextPathRelative:
      input.task === undefined
        ? null
        : relativePath(
            input.targetPath,
            contextPackMarkdownPath(input.targetPath, input.featureKey, input.task.id)
          ),
    verificationPathRelative: relativePath(
      input.targetPath,
      verificationMarkdownPath(input.targetPath, input.featureKey)
    )
  };
}

async function updateReviewStatus(input: {
  readonly targetPath: string;
  readonly featureId: string;
  readonly featureSlug: string;
  readonly featurePath: string;
  readonly task?: Task;
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
    currentState: "review_ready",
    lastCommand: "review",
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

export async function runReviewWorkflow(
  options: ReviewWorkflowOptions = {}
): Promise<Result<ReviewSummary, VispError>> {
  const cwd = options.cwd ?? process.cwd();
  const targetPath = path.resolve(cwd, options.targetPath ?? ".");
  const startedAt = options.now ?? new Date().toISOString();
  const startMs = Date.now();
  const dryRun = options.dryRun ?? false;
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
    stage: "review",
    feature: feature.value.key,
    taskId: selectedTask?.id,
    now: startedAt
  });
  const policyGate = policyGateResult.ok ? policyGateResult.value : undefined;
  const policyGateUnavailable = policyGateResult.ok
    ? undefined
    : `Review policy gate evaluation unavailable: ${policyGateResult.error.message}`;
  if (selectedTask !== undefined) {
    const checklistSummary = await getImplementationChecklistSummary({
      targetPath,
      featureKey: feature.value.key,
      taskId: selectedTask.id
    });

    if (checklistSummary.ok) {
      optionalWarnings.push(implementationChecklistStatusLine(checklistSummary.value));
    } else {
      optionalWarnings.push(
        `Implementation checklist status unavailable: ${checklistSummary.error.message}`
      );
    }
  }

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
  const project = await optionalArtifact({
    path: projectProfileArtifactPath(targetPath),
    schema: projectProfileSchema,
    artifactName: "project profile",
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
  const verification = options.skipVerification
    ? undefined
    : await optionalArtifact({
        path: verificationArtifactPath(targetPath, feature.value.key),
        schema: verificationReportSchema,
        artifactName: "verification report",
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

  const paths = outputPaths({
    targetPath,
    featureKey: feature.value.key,
    task: selectedTask
  });
  // The implement marker records what was already dirty when this task was
  // authorized, so review can attribute those files to earlier work instead of
  // reporting them as this task's scope violations.
  const marker =
    selectedTask === undefined
      ? undefined
      : await readArtifact(
          taskImplementMarkerPath(targetPath, selectedTask.id),
          implementMarkerSchema,
          { artifactName: "implement marker" }
        );
  const preExistingChangedFiles =
    marker?.ok === true ? marker.value.preExistingChangedFiles : undefined;

  const scope = reviewScope({
    files: diff.value.files,
    task: selectedTask,
    taskGraph: taskGraph.value,
    ...(preExistingChangedFiles === undefined ? {} : { preExistingChangedFiles })
  });
  const trace = reviewTraceability({
    taskGraph: taskGraph.value,
    task: selectedTask,
    spec: spec as SpecArtifact | undefined,
    traceability: traceability as TraceabilityMatrix | undefined
  });
  const verify = reviewVerification({
    verification: verification as VerificationReport | undefined,
    taskId: selectedTask?.id,
    reportPath: paths.verificationPathRelative,
    skipVerification: options.skipVerification
  });
  const test = reviewTestSignals({
    changedFiles: scope.changedFiles,
    task: selectedTask,
    spec: spec as SpecArtifact | undefined,
    contextPack: contextPack as ContextPack | undefined,
    project: project as ProjectProfile | undefined,
    verification: verification as VerificationReport | undefined
  });
  const dependency = reviewDependencies({
    changedFiles: scope.changedFiles,
    task: selectedTask,
    plan: plan as PlanDraftArtifact | undefined
  });
  const security = securityChecklist({
    changedFiles: scope.changedFiles,
    task: selectedTask
  });
  const documentationFindings = reviewDocumentation({
    changedFiles: scope.changedFiles
  });
  const gateBlocks =
    policyGate === undefined
      ? policyGateUnavailable !== undefined
      : gateBlocksWorkflow({ gate: policyGate, force: options.force });
  const gateFindingSeverity = gateBlocks ? "error" : "warning";
  const gateFindings: ReviewFindingDraft[] =
    policyGate === undefined
      ? policyGateUnavailable === undefined
        ? []
        : [
            finding({
              category: "verification",
              severity: "error",
              title: "Policy gate evaluation unavailable",
              description: policyGateUnavailable,
              evidence: policyGateUnavailable,
              recommendation: "Run visp override validate.",
              relatedTaskId: selectedTask?.id ?? null
            })
          ]
      : policyGate.failedRules.map((rule) =>
          finding({
            category: "verification",
            severity: gateFindingSeverity,
            title: `Policy gate ${rule.ruleId} did not pass`,
            description: rule.message,
            evidence: rule.evidence,
            recommendation: rule.recommendation,
            relatedTaskId: selectedTask?.id ?? null
          })
        );
  const findingDrafts: ReviewFindingDraft[] = [
    ...gateFindings,
    ...scope.findings,
    ...trace.findings,
    ...verify.findings,
    ...test.findings,
    ...dependency.findings,
    ...security.findings,
    ...documentationFindings
  ];
  const findings = numberFindings(findingDrafts);
  const messages = collectMessages({
    optionalWarnings,
    sections: [
      scope.scopeReview,
      trace.traceabilityReview,
      verify.verificationReview,
      test.testReview,
      dependency.dependencyReview,
      {
        warnings: policyGate === undefined || gateBlocks ? [] : gateWarningMessages(policyGate),
        errors:
          policyGate === undefined
            ? policyGateUnavailable === undefined
              ? []
              : [policyGateUnavailable]
            : gateBlocks
              ? gateFailureMessages(policyGate)
              : []
      }
    ]
  });
  const result = resultFromFindings(findings);
  const endedAt = new Date().toISOString();
  const baseReport = {
    id: `REV-${feature.value.id}-${selectedTask?.id ?? "feature"}`,
    featureId: feature.value.id,
    featureSlug: feature.value.slug,
    taskId: selectedTask?.id ?? null,
    mode: reviewMode(options, selectedTask),
    startedAt,
    endedAt,
    durationMs: Math.max(0, Date.now() - startMs),
    success: result !== "failed",
    result,
    changedFiles: scope.changedFiles,
    diffSummary: summarizeDiff({
      changedFiles: scope.changedFiles,
      diffSource: diff.value.diffSource,
      baseRef: diff.value.baseRef
    }),
    scopeReview: scope.scopeReview,
    traceabilityReview: trace.traceabilityReview,
    verificationReview: verify.verificationReview,
    testReview: test.testReview,
    dependencyReview: dependency.dependencyReview,
    policyGate,
    securityChecklist: security.checklist,
    findings,
    warnings: messages.warnings,
    errors: messages.errors,
    promptPath:
      options.checklistOnly && !options.promptOnly
        ? null
        : selectedTask === undefined && !options.promptOnly
          ? relativePath(targetPath, paths.currentPromptPath)
          : paths.promptPathRelative,
    reportPath: options.promptOnly || options.checklistOnly ? null : paths.reportPathRelative,
    checklistPath:
      options.promptOnly && !options.checklistOnly
        ? null
        : selectedTask === undefined && !options.checklistOnly
          ? null
          : paths.checklistPathRelative,
    nextCommand: "pending"
  };
  const report = {
    ...baseReport,
    nextCommand: nextCommand(baseReport)
  };
  const parsed = reviewReportSchema.safeParse(report);

  if (!parsed.success) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Generated review report is invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}`
      )
    );
  }

  if (!dryRun) {
    const prompt = renderReviewPrompt({
      report: parsed.data,
      taskTitle: selectedTask?.title,
      contextPath: paths.contextPathRelative,
      verificationPath: paths.verificationPathRelative,
      reviewReportPath: parsed.data.reportPath
    });
    const checklist = renderReviewChecklist(parsed.data);

    if (!options.promptOnly && !options.checklistOnly) {
      const writeJson = await writeArtifact(paths.reportJsonPath, reviewReportSchema, parsed.data, {
        artifactName: "review report"
      });

      if (!writeJson.ok) return writeJson;

      const writeMarkdown = await writeTextFile(
        paths.reportMarkdownPath,
        renderReviewMarkdown(parsed.data)
      );

      if (!writeMarkdown.ok) return writeMarkdown;
    }

    if (!options.checklistOnly || options.promptOnly) {
      if (selectedTask !== undefined || options.promptOnly) {
        const writePrompt = await writeTextFile(paths.promptPath, prompt);

        if (!writePrompt.ok) return writePrompt;
      }

      const writeCurrentPrompt = await writeTextFile(paths.currentPromptPath, prompt);

      if (!writeCurrentPrompt.ok) return writeCurrentPrompt;
    }

    if (
      (!options.promptOnly || options.checklistOnly) &&
      (selectedTask !== undefined || options.checklistOnly)
    ) {
      const writeChecklist = await writeTextFile(paths.checklistPath, checklist);

      if (!writeChecklist.ok) return writeChecklist;
    }

    if (parsed.data.success) {
      const statusUpdate = await updateReviewStatus({
        targetPath,
        featureId: feature.value.id,
        featureSlug: feature.value.slug,
        featurePath: feature.value.relativePath,
        task: selectedTask,
        now: endedAt
      });

      if (!statusUpdate.ok) return statusUpdate;
    }
  }

  const extraWarnings: string[] = [];
  const writtenFiles: string[] = [];

  if (!options.promptOnly && !options.checklistOnly && !dryRun) {
    writtenFiles.push(paths.reportPathRelative, relativePath(targetPath, paths.reportJsonPath));
  }

  if (
    !dryRun &&
    (!options.checklistOnly || options.promptOnly) &&
    (selectedTask !== undefined || options.promptOnly)
  ) {
    writtenFiles.push(paths.promptPathRelative);
  }

  if (!dryRun && !options.checklistOnly) {
    writtenFiles.push(relativePath(targetPath, paths.currentPromptPath));
  }

  if (
    !dryRun &&
    (!options.promptOnly || options.checklistOnly) &&
    (selectedTask !== undefined || options.checklistOnly)
  ) {
    writtenFiles.push(paths.checklistPathRelative);
  }

  if (!options.promptOnly && !options.checklistOnly) {
    if (selectedTask !== undefined && parsed.data.result !== "failed") {
      const checklist = await markImplementationChecklistSteps({
        targetPath,
        featureKey: feature.value.key,
        taskId: selectedTask.id,
        steps: ["review"],
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

    writtenFiles.push(...budgetRefresh.writtenFiles);
    extraWarnings.push(...budgetRefresh.warnings);

    const timeline = await refreshFeatureTimeline({
      targetPath,
      feature: feature.value.key,
      taskId: selectedTask?.id,
      dryRun,
      now: endedAt
    });

    writtenFiles.push(...timeline.writtenFiles);
    extraWarnings.push(...timeline.warnings);
  }

  const run = await recordWorkflowRun({
    targetPath,
    command: "review",
    startedAt,
    endedAt,
    feature: {
      id: feature.value.id,
      slug: feature.value.slug
    },
    taskId: selectedTask?.id,
    success: parsed.data.success,
    result: parsed.data.result,
    actions: writtenFiles.map((filePath) => ({
      path: filePath,
      action: "updated" as const
    })),
    warnings: [...parsed.data.warnings, ...extraWarnings],
    errors: parsed.data.errors,
    events: [
      {
        type: "evidence_recorded",
        message: `Review completed with result ${parsed.data.result}.`,
        artifactPath: parsed.data.reportPath ?? undefined
      }
    ],
    dryRun
  });

  extraWarnings.push(...run.warnings);

  return ok(
    reviewSummaryFromReport({
      report: {
        ...parsed.data,
        warnings: [...new Set([...parsed.data.warnings, ...extraWarnings])]
      },
      targetPath,
      dryRun
    })
  );
}

export { formatReviewSummary };
