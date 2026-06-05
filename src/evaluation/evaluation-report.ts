import { type EvaluationCheck, type EvaluationReport } from "../artifacts/schemas/evaluation.schema.js";

export function evaluationResult(checks: readonly EvaluationCheck[]): "passed" | "warnings" | "failed" {
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
    `- Checks: ${report.checks.length}`,
    `- Errors: ${report.errors.length}`,
    `- Warnings: ${report.warnings.length}`,
    "",
    "## Checks",
    ""
  ];

  if (report.checks.length === 0) {
    lines.push("- No checks were produced.");
  } else {
    lines.push(
      ...report.checks.map((check) =>
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
