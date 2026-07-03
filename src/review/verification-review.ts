import { type VerificationReport } from "../artifacts/schemas/verification.schema.js";
import { finding, type ReviewFindingDraft } from "./review-findings.js";

export function reviewVerification(input: {
  readonly verification?: VerificationReport;
  readonly taskId?: string;
  readonly reportPath?: string;
  readonly skipVerification?: boolean;
}): {
  readonly verificationReview: {
    readonly status: "passed" | "warnings" | "failed" | "missing" | "skipped";
    readonly reportPath: string | null;
    readonly verificationPassed: boolean | null;
    readonly verificationTaskId: string | null;
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
  };
  readonly findings: readonly ReviewFindingDraft[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  const findings: ReviewFindingDraft[] = [];

  if (input.skipVerification) {
    findings.push(
      finding({
        category: "verification",
        severity: "info",
        title: "Verification review skipped",
        description: "The review was run with --skip-verification.",
        evidence: "--skip-verification was provided.",
        recommendation: "Run visp verify before final approval if deterministic gates are needed.",
        relatedTaskId: input.taskId ?? null
      })
    );

    return {
      verificationReview: {
        status: "skipped",
        reportPath: null,
        verificationPassed: null,
        verificationTaskId: null,
        warnings: [],
        errors: []
      },
      findings
    };
  }

  if (input.verification === undefined) {
    const command =
      input.taskId === undefined ? "visp verify" : `visp verify --task ${input.taskId}`;

    warnings.push("Verification report is missing.");
    findings.push(
      finding({
        category: "verification",
        severity: "warning",
        title: "Verification report missing",
        description: "No verification report was found for this feature.",
        evidence: "verification.json is missing or unreadable.",
        recommendation: `Run ${command} before relying on this review.`,
        relatedTaskId: input.taskId ?? null
      })
    );

    return {
      verificationReview: {
        status: "missing",
        reportPath: null,
        verificationPassed: null,
        verificationTaskId: null,
        warnings,
        errors
      },
      findings
    };
  }

  if (input.taskId !== undefined && input.verification.taskId !== input.taskId) {
    warnings.push(
      `Verification report task ${input.verification.taskId ?? "feature-level"} does not match ${input.taskId}.`
    );
  }

  if (input.verification.success) {
    findings.push(
      finding({
        category: "verification",
        severity: "info",
        title: "Verification passed",
        description: "The latest verification report passed.",
        evidence: input.reportPath ?? "verification.json",
        recommendation: "Use the report as deterministic evidence for review.",
        relatedTaskId: input.taskId ?? null
      })
    );
  } else {
    errors.push("Verification report failed.");
    findings.push(
      finding({
        category: "verification",
        severity: "error",
        title: "Verification failed",
        description: "The latest verification report did not pass.",
        evidence: input.verification.errors.join("; ") || "verification success is false.",
        recommendation: "Fix verification errors and rerun visp verify before proceeding.",
        relatedTaskId: input.taskId ?? null
      })
    );
  }

  return {
    verificationReview: {
      status: errors.length > 0 ? "failed" : warnings.length > 0 ? "warnings" : "passed",
      reportPath: input.reportPath ?? null,
      verificationPassed: input.verification.success,
      verificationTaskId: input.verification.taskId,
      warnings,
      errors
    },
    findings
  };
}
