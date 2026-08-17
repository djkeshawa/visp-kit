import path from "node:path";

import { VispError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import { clearTaskImplementMarker } from "../gates/implement-marker.js";
import { assuranceActive } from "../oracle/assurance-activation.js";
import { loadEffectivePolicy } from "../policy/policy-loader.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { runBudgetWorkflow } from "./budget.workflow.js";
import { runCandidateVerificationWorkflow } from "./candidate-verification.workflow.js";
import { runChecklistStatusWorkflow } from "./checklist.workflow.js";
import { runNextWorkflow } from "./next.workflow.js";
import { oraclePlanExists } from "./oracle-authorization.workflow.js";
import { describeTaskStatusUpdate } from "../reconcile/task-status-update.js";
import { runReconcileWorkflow } from "./reconcile.workflow.js";
import { runReviewWorkflow } from "./review.workflow.js";
import { runVerifyWorkflow } from "./verify.workflow.js";

export type DoneWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly model?: string;
  readonly usageNote?: string;
  readonly usageUnavailable?: boolean;
  readonly dryRun?: boolean;
  readonly now?: string;
};

export type DoneStepName =
  | "candidate"
  | "verify"
  | "budget"
  | "review"
  | "reconcile"
  | "checklist"
  | "next";

export type DoneStepResult = {
  readonly name: DoneStepName;
  readonly success: boolean;
  readonly skipped: boolean;
  readonly detail: string;
  readonly recovery: string | null;
};

export type DoneWorkflowSummary = {
  readonly success: boolean;
  readonly targetPath: string;
  readonly taskId: string;
  readonly dryRun: boolean;
  readonly steps: readonly DoneStepResult[];
  readonly nextCommand: string | null;
};

function step(input: {
  readonly name: DoneStepName;
  readonly success: boolean;
  readonly skipped?: boolean;
  readonly detail: string;
  readonly recovery?: string;
}): DoneStepResult {
  return {
    name: input.name,
    success: input.success,
    skipped: input.skipped ?? false,
    detail: input.detail,
    recovery: input.recovery ?? null
  };
}

export async function runDoneWorkflow(
  options: DoneWorkflowOptions = {}
): Promise<Result<DoneWorkflowSummary, VispError>> {
  const cwd = options.cwd ?? process.cwd();
  const targetPath = path.resolve(cwd, options.targetPath ?? ".");
  const taskId = options.taskId?.trim();
  const dryRun = options.dryRun ?? false;

  if (taskId === undefined || taskId.length === 0) {
    return err(new VispError("VALIDATION_FAILED", "visp-kit done requires --task <task-id>."));
  }

  const recordsUsage = options.inputTokens !== undefined || options.outputTokens !== undefined;

  if (recordsUsage && (options.inputTokens === undefined || options.outputTokens === undefined)) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Recording usage requires both --input-tokens and --output-tokens."
      )
    );
  }

  if (recordsUsage && options.usageUnavailable === true) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Use either --input-tokens/--output-tokens or --usage-unavailable, not both."
      )
    );
  }

  const steps: DoneStepResult[] = [];
  const shared = {
    targetPath: options.targetPath,
    cwd: options.cwd,
    feature: options.feature,
    taskId
  };

  const summarize = (nextCommand: string | null): DoneWorkflowSummary => ({
    success: steps.every((item) => item.success),
    targetPath,
    taskId,
    dryRun,
    steps,
    nextCommand
  });

  const policy = await loadEffectivePolicy({
    targetPath,
    now: options.now ?? new Date().toISOString()
  });
  if (!policy.ok) return policy;
  const planExists = await oraclePlanExists(shared);
  if (!planExists.ok) return planExists;
  const candidateRequired = assuranceActive({
    policy: policy.value.policy,
    oraclePlanExists: planExists.value
  });

  if (candidateRequired) {
    const candidate = await runCandidateVerificationWorkflow({
      ...shared,
      dryRun
    });

    if (!candidate.ok) {
      steps.push(
        step({
          name: "candidate",
          success: false,
          detail: candidate.error.message,
          recovery: `visp-kit verify --candidate --task ${taskId}`
        })
      );
      return ok(summarize(`visp-kit verify --candidate --task ${taskId}`));
    }

    steps.push(
      step({
        name: "candidate",
        success: candidate.value.success,
        detail: candidate.value.success
          ? "Candidate evidence passed the locked baseline/oracle comparison."
          : `Candidate evidence was ${candidate.value.outcome}.`,
        recovery: candidate.value.success
          ? undefined
          : `visp-kit verify --candidate --task ${taskId}`
      })
    );

    if (!candidate.value.success) {
      return ok(summarize(`visp-kit verify --candidate --task ${taskId}`));
    }
  }

  const verify = await runVerifyWorkflow({
    ...shared,
    skipCommands: candidateRequired,
    dryRun
  });

  if (!verify.ok) {
    steps.push(
      step({
        name: "verify",
        success: false,
        detail: verify.error.message,
        recovery: `visp-kit verify --task ${taskId}`
      })
    );
    return ok(summarize(`visp-kit verify --task ${taskId}`));
  }

  steps.push(
    step({
      name: "verify",
      success: verify.value.success,
      detail: verify.value.success
        ? "Verification passed."
        : `Verification failed: ${verify.value.errors.join("; ") || "fix the reported issues, then rerun."}`,
      recovery: verify.value.success ? undefined : `visp-kit verify --task ${taskId}`
    })
  );

  if (!verify.value.success) {
    return ok(summarize(`visp-kit verify --task ${taskId}`));
  }

  if (recordsUsage || options.usageUnavailable === true) {
    const budget = await runBudgetWorkflow({
      ...shared,
      recordUsage: recordsUsage,
      recordUsageUnavailable: options.usageUnavailable === true,
      inputTokens: options.inputTokens,
      outputTokens: options.outputTokens,
      model: options.model,
      usageNote: options.usageNote,
      writeReport: true,
      dryRun,
      now: options.now
    });

    if (!budget.ok) {
      steps.push(
        step({
          name: "budget",
          success: false,
          detail: budget.error.message,
          recovery: `visp-kit budget --task ${taskId} --record-usage --input-tokens <n> --output-tokens <n> --write-report`
        })
      );
      return ok(summarize(null));
    }

    steps.push(
      step({
        name: "budget",
        success: true,
        detail: recordsUsage ? "Actual token usage recorded." : "Usage recorded as unavailable."
      })
    );
  } else {
    steps.push(
      step({
        name: "budget",
        success: true,
        skipped: true,
        detail:
          "No usage flags provided. Record usage with --input-tokens/--output-tokens or --usage-unavailable."
      })
    );
  }

  const review = await runReviewWorkflow({ ...shared, dryRun });

  if (!review.ok) {
    steps.push(
      step({
        name: "review",
        success: false,
        detail: review.error.message,
        recovery: `visp-kit review --task ${taskId}`
      })
    );
    return ok(summarize(`visp-kit review --task ${taskId}`));
  }

  const reviewScope = review.value.scopeBasis;
  const reviewedFiles =
    reviewScope === null
      ? ""
      : ` Scope: ${reviewScope.reviewableFiles.length} reviewable of ${reviewScope.filesExamined} examined (${reviewScope.kind}).`;
  const blockingReviewFindings = review.value.findings
    .filter((item) => item.severity === "error")
    .map((item) => item.title);

  steps.push(
    step({
      name: "review",
      success: review.value.success,
      detail: review.value.success
        ? `Review ${review.value.result}.${reviewedFiles}`
        : `Review failed: ${blockingReviewFindings.join("; ") || "fix the blocking findings, then rerun"}.${reviewedFiles}`,
      recovery: review.value.success ? undefined : `visp-kit review --task ${taskId}`
    })
  );

  if (!review.value.success) {
    return ok(summarize(`visp-kit review --task ${taskId}`));
  }

  // `updateTaskStatus` is what moves the task out of `pending`, and reconcile
  // is the only step that can do it. Omitting it here (LC-107) meant nine green
  // `done` runs left nine tasks pending and `visp-kit next` pointing at T001
  // forever — the documented loop had no ending.
  const reconcile = await runReconcileWorkflow({
    ...shared,
    updateTraceability: true,
    updateTaskStatus: true,
    closeTaskOnWarnings: true,
    dryRun
  });

  if (!reconcile.ok) {
    steps.push(
      step({
        name: "reconcile",
        success: false,
        detail: reconcile.error.message,
        recovery: `visp-kit reconcile --task ${taskId} --update-traceability`
      })
    );
    return ok(summarize(`visp-kit reconcile --task ${taskId} --update-traceability`));
  }

  // A task that did not move is not a finished task, whatever the rest of the
  // pipeline reported. In a dry run nothing is written by design, so the
  // absence of a status move is expected rather than a failure.
  const statusUpdate = reconcile.value.taskStatusUpdate;
  const taskAdvanced = dryRun || statusUpdate?.performed === true;
  const reconcileRecovery = `visp-kit reconcile --task ${taskId} --update-traceability --update-task-status`;

  steps.push(
    step({
      name: "reconcile",
      success: reconcile.value.success && taskAdvanced,
      detail: !reconcile.value.success
        ? "Reconciliation failed. Fix the reported drift, then rerun."
        : taskAdvanced
          ? `Reconciliation ${reconcile.value.result}. ${describeTaskStatusUpdate(
              statusUpdate ?? {
                requested: true,
                performed: false,
                taskId,
                previousStatus: null,
                newStatus: null,
                skippedReason: "reconcile report carries no task status record"
              }
            )}.`
          : `Reconciliation ${reconcile.value.result} but the task status did not move: ${
              statusUpdate?.skippedReason ?? "reconcile report carries no task status record"
            }.`,
      recovery:
        reconcile.value.success && taskAdvanced
          ? undefined
          : reconcile.value.success
            ? `${reconcileRecovery} --force`
            : reconcileRecovery
    })
  );

  if (!reconcile.value.success || !taskAdvanced) {
    return ok(
      summarize(reconcile.value.success ? `${reconcileRecovery} --force` : reconcileRecovery)
    );
  }

  const checklist = await runChecklistStatusWorkflow(shared);

  if (!checklist.ok) {
    steps.push(
      step({
        name: "checklist",
        success: false,
        detail: checklist.error.message,
        recovery: `visp-kit checklist status --task ${taskId}`
      })
    );
    return ok(summarize(`visp-kit checklist status --task ${taskId}`));
  }

  const pending = checklist.value.summary.pendingRequired.map((item) => item.id);
  const blocked = checklist.value.summary.blockedRequired.map((item) => item.id);

  steps.push(
    step({
      name: "checklist",
      success: checklist.value.success,
      detail: checklist.value.success
        ? "All required checklist items are complete."
        : `Required checklist items are incomplete: ${[...pending, ...blocked].join(", ")}.`,
      recovery: checklist.value.success
        ? undefined
        : `visp-kit checklist update --task ${taskId} --item <item-id> --status done`
    })
  );

  const next = await runNextWorkflow({
    targetPath: options.targetPath,
    cwd: options.cwd,
    feature: options.feature
  });

  if (!next.ok) {
    steps.push(
      step({
        name: "next",
        success: false,
        detail: next.error.message,
        recovery: "visp-kit next"
      })
    );
    return ok(summarize("visp-kit next"));
  }

  steps.push(
    step({
      name: "next",
      success: true,
      detail: next.value.nextCommand
    })
  );

  const summary = summarize(next.value.nextCommand);

  if (summary.success && !dryRun) {
    const cleared = await clearTaskImplementMarker(targetPath, taskId);

    if (!cleared.ok) return cleared;
  }

  return ok(summary);
}

export function formatDoneSummary(summary: DoneWorkflowSummary): string {
  const lines: string[] = [
    formatHeader("Visp done"),
    formatKeyValue("Task", summary.taskId),
    formatKeyValue("Result", summary.success ? "passed" : "failed"),
    ""
  ];

  for (const item of summary.steps) {
    const mark = item.skipped ? "-" : item.success ? "✓" : "✗";
    lines.push(`${mark} ${item.name}: ${item.detail}`);

    if (item.recovery !== null) {
      lines.push(`  Recover: run \`${item.recovery}\``);
    }
  }

  if (summary.nextCommand !== null) {
    lines.push("", "Next:", `  ${summary.nextCommand}`);
  }

  return `${lines.join("\n")}\n`;
}
