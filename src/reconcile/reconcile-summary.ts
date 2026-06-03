import { type ReconcileReport } from "../artifacts/schemas/reconcile.schema.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";

export type ReconcileSummary = {
  readonly success: boolean;
  readonly targetPath: string;
  readonly feature: {
    readonly id: string;
    readonly slug: string;
  };
  readonly taskId: string | null;
  readonly result: "passed" | "warnings" | "failed";
  readonly changedFiles: readonly {
    readonly path: string;
    readonly mappingStatus: string;
    readonly relatedTaskIds: readonly string[];
    readonly relatedRequirementIds: readonly string[];
    readonly relatedAcceptanceCriterionIds: readonly string[];
  }[];
  readonly findings: readonly {
    readonly id: string;
    readonly category: string;
    readonly severity: string;
    readonly driftType: string;
    readonly title: string;
  }[];
  readonly traceabilityUpdate: {
    readonly requested: boolean;
    readonly performed: boolean;
    readonly updatedFiles: readonly string[];
  };
  readonly reportPath: string | null;
  readonly promptPath: string | null;
  readonly nextCommand: string;
  readonly dryRun: boolean;
};

function count(summary: ReconcileSummary, severity: string): number {
  return summary.findings.filter((finding) => finding.severity === severity).length;
}

export function reconcileSummaryFromReport(input: {
  readonly report: ReconcileReport;
  readonly targetPath: string;
  readonly dryRun: boolean;
}): ReconcileSummary {
  return {
    success: input.report.result !== "failed" || input.dryRun,
    targetPath: input.targetPath,
    feature: {
      id: input.report.featureId,
      slug: input.report.featureSlug
    },
    taskId: input.report.taskId,
    result: input.report.result,
    changedFiles: input.report.changedFiles.map((file) => ({
      path: file.path,
      mappingStatus: file.mappingStatus,
      relatedTaskIds: file.relatedTaskIds,
      relatedRequirementIds: file.relatedRequirementIds,
      relatedAcceptanceCriterionIds: file.relatedAcceptanceCriterionIds
    })),
    findings: input.report.findings.map((finding) => ({
      id: finding.id,
      category: finding.category,
      severity: finding.severity,
      driftType: finding.driftType,
      title: finding.title
    })),
    traceabilityUpdate: {
      requested: input.report.traceabilityUpdate.requested,
      performed: input.report.traceabilityUpdate.performed,
      updatedFiles: input.report.traceabilityUpdate.updatedFiles
    },
    reportPath: input.dryRun ? null : input.report.reportPath,
    promptPath: input.dryRun ? null : input.report.promptPath,
    nextCommand: input.report.nextCommand,
    dryRun: input.dryRun
  };
}

export function formatReconcileSummary(summary: ReconcileSummary): string {
  const lines = [
    formatHeader(
      summary.result === "failed"
        ? "Visp reconciliation failed."
        : summary.result === "warnings"
          ? "Visp reconciliation completed with warnings."
          : "Visp reconciliation complete."
    ),
    "",
    formatKeyValue("Feature", `${summary.feature.id}-${summary.feature.slug}`),
    formatKeyValue("Task", summary.taskId ?? "feature-level"),
    formatKeyValue("Result", summary.result),
    "",
    `Changed files: ${summary.changedFiles.length}`,
    "Findings:",
    `  Errors: ${count(summary, "error")}`,
    `  Warnings: ${count(summary, "warning")}`,
    `  Info: ${count(summary, "info")}`,
    "",
    "Traceability:",
    `  ${summary.traceabilityUpdate.performed ? "updated" : "not updated"}`
  ];

  if (summary.reportPath !== null) {
    lines.push("", "Report:", `  ${summary.reportPath}`);
  }

  if (summary.promptPath !== null) {
    lines.push("", "Prompt:", `  ${summary.promptPath}`);
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
