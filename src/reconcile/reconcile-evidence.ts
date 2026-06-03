import { type ReviewReport } from "../artifacts/schemas/review.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { type VerificationReport } from "../artifacts/schemas/verification.schema.js";
import { reconcileFinding, type ReconcileFindingDraft } from "./reconcile-findings.js";

function warningOrErrorForMissing(task: Task | undefined, force: boolean): "warning" | "error" {
  if (force) return "warning";
  return task?.riskLevel === "medium" || task?.riskLevel === "high" ? "error" : "warning";
}

export function reconcileVerificationEvidence(input: {
  readonly verification?: VerificationReport;
  readonly task?: Task;
  readonly reportPath?: string | null;
  readonly force: boolean;
}): {
  readonly evidence: {
    readonly status: "passed" | "warnings" | "failed";
    readonly reportPath: string | null;
    readonly found: boolean;
    readonly passed: boolean | null;
    readonly result: string | null;
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
    readonly summary: readonly string[];
  };
  readonly findings: readonly ReconcileFindingDraft[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  const findings: ReconcileFindingDraft[] = [];

  if (input.verification === undefined) {
    const severity = warningOrErrorForMissing(input.task, input.force);
    const message = "Verification report is missing.";

    if (severity === "error") errors.push(message);
    else warnings.push(message);

    findings.push(
      reconcileFinding({
        category: "verification",
        severity,
        driftType: "verification_missing",
        title: "Verification evidence missing",
        description: "No verification report was available for reconciliation.",
        evidence: message,
        recommendation: input.task === undefined ? "Run visp verify." : `Run visp verify --task ${input.task.id}.`,
        relatedTaskId: input.task?.id ?? null
      })
    );

    return {
      evidence: {
        status: errors.length > 0 ? "failed" : "warnings",
        reportPath: null,
        found: false,
        passed: null,
        result: null,
        warnings,
        errors,
        summary: []
      },
      findings
    };
  }

  if (input.task !== undefined && input.verification.taskId !== input.task.id) {
    warnings.push(
      `Verification task ${input.verification.taskId ?? "feature-level"} does not match ${input.task.id}.`
    );
  }

  if (!input.verification.success) {
    errors.push("Verification report failed.");
    findings.push(
      reconcileFinding({
        category: "verification",
        severity: "error",
        driftType: "verification_failed",
        title: "Verification failed",
        description: "Reconciliation cannot pass while verification is failed.",
        evidence: input.verification.errors.join("; ") || "verification success is false.",
        recommendation: input.task === undefined ? "Fix verification and rerun visp verify." : `Fix verification and rerun visp verify --task ${input.task.id}.`,
        relatedTaskId: input.task?.id ?? null
      })
    );
  } else {
    findings.push(
      reconcileFinding({
        category: "verification",
        severity: "info",
        driftType: "evidence_found",
        title: "Verification passed",
        description: "Verification report passed.",
        evidence: input.reportPath ?? "verification.json",
        recommendation: "Use this as deterministic validation evidence.",
        relatedTaskId: input.task?.id ?? null
      })
    );
  }

  return {
    evidence: {
      status: errors.length > 0 ? "failed" : warnings.length > 0 ? "warnings" : "passed",
      reportPath: input.reportPath ?? null,
      found: true,
      passed: input.verification.success,
      result: input.verification.success ? "passed" : "failed",
      warnings,
      errors,
      summary: [
        `${input.verification.summary.commandsPassed} commands passed`,
        `${input.verification.summary.commandsFailed} commands failed`
      ]
    },
    findings
  };
}

export function reconcileReviewEvidence(input: {
  readonly review?: ReviewReport;
  readonly task?: Task;
  readonly reportPath?: string | null;
  readonly force: boolean;
}): {
  readonly evidence: {
    readonly status: "passed" | "warnings" | "failed";
    readonly reportPath: string | null;
    readonly found: boolean;
    readonly passed: boolean | null;
    readonly result: string | null;
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
    readonly summary: readonly string[];
  };
  readonly findings: readonly ReconcileFindingDraft[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  const findings: ReconcileFindingDraft[] = [];

  if (input.review === undefined) {
    const severity = warningOrErrorForMissing(input.task, input.force);
    const message = "Review report is missing.";

    if (severity === "error") errors.push(message);
    else warnings.push(message);

    findings.push(
      reconcileFinding({
        category: "review",
        severity,
        driftType: "review_missing",
        title: "Review evidence missing",
        description: "No review report was available for reconciliation.",
        evidence: message,
        recommendation: input.task === undefined ? "Run visp review." : `Run visp review --task ${input.task.id}.`,
        relatedTaskId: input.task?.id ?? null
      })
    );

    return {
      evidence: {
        status: errors.length > 0 ? "failed" : "warnings",
        reportPath: null,
        found: false,
        passed: null,
        result: null,
        warnings,
        errors,
        summary: []
      },
      findings
    };
  }

  if (input.task !== undefined && input.review.taskId !== input.task.id) {
    warnings.push(`Review task ${input.review.taskId ?? "feature-level"} does not match ${input.task.id}.`);
  }

  if (input.review.result === "failed") {
    errors.push("Review report failed.");
    findings.push(
      reconcileFinding({
        category: "review",
        severity: "error",
        driftType: "review_failed",
        title: "Review failed",
        description: "Reconciliation cannot pass while review is failed.",
        evidence: input.review.errors.join("; ") || "review result is failed.",
        recommendation: input.task === undefined ? "Fix review findings and rerun visp review." : `Fix review findings and rerun visp review --task ${input.task.id}.`,
        relatedTaskId: input.task?.id ?? null
      })
    );
  } else if (input.review.result === "warnings") {
    warnings.push("Review report has warnings.");
    findings.push(
      reconcileFinding({
        category: "review",
        severity: "warning",
        driftType: "manual_review_needed",
        title: "Review warnings remain",
        description: "The review report passed with warnings that need human attention.",
        evidence: "Review report has warnings.",
        recommendation: input.task === undefined ? "Review warnings before PR." : `Review warnings before reconciling ${input.task.id}.`,
        relatedTaskId: input.task?.id ?? null,
        relatedRequirementIds: input.task?.requirementIds ?? [],
        relatedAcceptanceCriterionIds: input.task?.acceptanceCriterionIds ?? []
      })
    );
  }

  return {
    evidence: {
      status: errors.length > 0 ? "failed" : warnings.length > 0 ? "warnings" : "passed",
      reportPath: input.reportPath ?? null,
      found: true,
      passed: input.review.result !== "failed",
      result: input.review.result,
      warnings,
      errors,
      summary: [
        `${input.review.findings.filter((finding) => finding.severity === "error").length} review errors`,
        `${input.review.findings.filter((finding) => finding.severity === "warning").length} review warnings`
      ]
    },
    findings
  };
}
