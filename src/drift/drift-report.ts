import {
  type DriftFinding,
  type DriftReport,
  type DriftResult
} from "../artifacts/schemas/drift.schema.js";

export function driftResult(findings: readonly DriftFinding[]): DriftResult {
  if (findings.some((finding) => finding.severity === "error")) return "failed";
  if (findings.some((finding) => finding.severity === "warning")) return "warnings";
  return "passed";
}

export function renderDriftMarkdown(report: DriftReport): string {
  const lines = [
    "# Visp Drift Report",
    "",
    "## Summary",
    "",
    `- Result: ${report.result}`,
    `- Feature: ${report.featureId ?? "none"}`,
    `- Findings: ${report.findings.length}`,
    `- Errors: ${report.findings.filter((finding) => finding.severity === "error").length}`,
    `- Warnings: ${report.findings.filter((finding) => finding.severity === "warning").length}`,
    "",
    "## Findings",
    ""
  ];

  if (report.findings.length === 0) {
    lines.push("- No drift detected. Specs, tasks, context packs, and code agree.");
  } else {
    lines.push(
      ...report.findings.map(
        (finding) =>
          `### ${finding.severity.toUpperCase()} ${finding.id}: ${finding.kind}

Task: ${finding.taskId ?? "none"}
File: ${finding.file ?? "none"}

${finding.evidence}

Recommended: ${finding.recommendation}
`
      )
    );
  }

  lines.push("", "## Next", "", `\`${report.nextCommand}\``, "");

  return lines.join("\n");
}
