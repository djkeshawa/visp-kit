import {
  type EvaluationCheck,
  type EvaluationReport
} from "../artifacts/schemas/evaluation.schema.js";

export function evaluationResult(
  checks: readonly EvaluationCheck[]
): "passed" | "warnings" | "failed" {
  if (checks.some((check) => check.severity === "error")) return "failed";
  if (checks.some((check) => check.severity === "warning")) return "warnings";
  return "passed";
}

export function renderEvaluationMarkdown(report: EvaluationReport): string {
  const lines = [
    "# Visp Evaluation Report",
    "",
    "## Summary",
    "",
    `- Result: ${report.result}`,
    `- Feature: ${report.featureId ?? "none"}`,
    `- Task: ${report.taskId ?? "none"}`,
    `- Checks performed: ${report.coverage?.checksPerformed ?? report.checks.length}`,
    `- Findings: ${report.checks.length}`,
    `- Errors: ${report.errors.length}`,
    `- Warnings: ${report.warnings.length}`,
    ""
  ];

  if (report.coverage !== undefined) {
    lines.push(
      "## Coverage",
      "",
      report.coverage.description,
      "",
      ...report.coverage.performedChecks.map((name) => `- Checked: ${name}`),
      ...report.coverage.skippedChecks.map(
        (entry) => `- Not checked: ${entry.inspection} — ${entry.reason}`
      ),
      ""
    );
  }

  lines.push("## Findings", "");

  if (report.checks.length === 0) {
    lines.push("- No findings. See Coverage above for what was checked.");
  } else {
    lines.push(
      ...report.checks.map(
        (check) =>
          `### ${check.severity.toUpperCase()} ${check.id}: ${check.title}

Category: ${check.category}
File: ${check.file ?? "none"}

${check.description}

Recommendation: ${check.recommendation}
`
      )
    );
  }

  lines.push("", "## Next", "", report.nextCommand, "");

  return `${lines.join("\n")}\n`;
}
