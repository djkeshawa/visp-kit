import { type ReviewReport, type ReviewScopeBasis } from "../artifacts/schemas/review.schema.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";

const maxListedFiles = 10;

export type ReviewSummary = {
  readonly success: boolean;
  readonly targetPath: string;
  readonly feature: {
    readonly id: string;
    readonly slug: string;
  };
  readonly taskId: string | null;
  readonly result: "passed" | "warnings" | "failed";
  /** What the review looked at. Absent only on reports written before LC-106. */
  readonly scopeBasis: ReviewScopeBasis | null;
  readonly changedFiles: readonly {
    readonly path: string;
    readonly changeType: string;
    readonly additions: number;
    readonly deletions: number;
  }[];
  readonly findings: readonly {
    readonly id: string;
    readonly category: string;
    readonly severity: string;
    readonly title: string;
  }[];
  readonly reportPath: string | null;
  readonly promptPath: string | null;
  readonly checklistPath: string | null;
  readonly nextCommand: string;
  readonly dryRun: boolean;
};

function count(report: ReviewSummary, severity: string): number {
  return report.findings.filter((finding) => finding.severity === severity).length;
}

export function reviewSummaryFromReport(input: {
  readonly report: ReviewReport;
  readonly targetPath: string;
  readonly dryRun: boolean;
}): ReviewSummary {
  return {
    success: input.report.result !== "failed" || input.dryRun,
    targetPath: input.targetPath,
    feature: {
      id: input.report.featureId,
      slug: input.report.featureSlug
    },
    taskId: input.report.taskId,
    result: input.report.result,
    scopeBasis: input.report.scopeBasis ?? null,
    changedFiles: input.report.changedFiles.map((file) => ({
      path: file.path,
      changeType: file.changeType,
      additions: file.additions,
      deletions: file.deletions
    })),
    findings: input.report.findings.map((finding) => ({
      id: finding.id,
      category: finding.category,
      severity: finding.severity,
      title: finding.title
    })),
    reportPath: input.dryRun ? null : input.report.reportPath,
    promptPath: input.dryRun ? null : input.report.promptPath,
    checklistPath: input.dryRun ? null : input.report.checklistPath,
    nextCommand: input.report.nextCommand,
    dryRun: input.dryRun
  };
}

/**
 * The scope block answers "what did this review actually look at?" before it
 * answers "what did it find?". A verdict with no stated scope was how eight
 * reviews of zero files read as eight clean reviews.
 */
function scopeLines(basis: ReviewScopeBasis | null): readonly string[] {
  if (basis === null) return [];

  const listed = basis.examinedFiles.slice(0, maxListedFiles);
  const remaining = basis.examinedFiles.length - listed.length;

  return [
    "",
    "Scope:",
    `  Basis: ${basis.description}`,
    `  Files examined: ${basis.filesExamined}`,
    ...listed.map((file) => `    ${file}`),
    ...(remaining > 0 ? [`    ...and ${remaining} more`] : []),
    `  Reviewable files: ${basis.reviewableFiles.length}${
      basis.empty ? " (nothing to review — this verdict is inconclusive)" : ""
    }`
  ];
}

export function formatReviewSummary(summary: ReviewSummary): string {
  const errors = count(summary, "error");
  const warnings = count(summary, "warning");
  const info = count(summary, "info");
  const lines = [
    formatHeader(summary.result === "failed" ? "Visp review failed." : "Visp review complete."),
    "",
    formatKeyValue("Feature", `${summary.feature.id}-${summary.feature.slug}`),
    formatKeyValue("Task", summary.taskId ?? "feature-level"),
    formatKeyValue("Result", summary.result),
    ...scopeLines(summary.scopeBasis),
    "",
    `Changed files: ${summary.changedFiles.length}`,
    "Findings:",
    `  Errors: ${errors}`,
    `  Warnings: ${warnings}`,
    `  Info: ${info}`
  ];

  if (summary.reportPath !== null) {
    lines.push("", "Report:", `  ${summary.reportPath}`);
  }

  if (summary.promptPath !== null) {
    lines.push("", "Prompt:", `  ${summary.promptPath}`);
  }

  if (summary.checklistPath !== null) {
    lines.push("", "Checklist:", `  ${summary.checklistPath}`);
  }

  const blocking = summary.findings.filter((finding) => finding.severity === "error");

  if (blocking.length > 0) {
    lines.push(
      "",
      "Blocking findings:",
      ...blocking.map((finding) => `  ${finding.id}: ${finding.title}`)
    );
  }

  lines.push("", "Next:", `  ${summary.nextCommand}`);

  return `${lines.join("\n")}\n`;
}
