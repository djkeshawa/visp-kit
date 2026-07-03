import { type DoctorCheckResult, type DoctorFinding } from "./doctor-checks.js";
import { type DoctorFixResult } from "./doctor-fixes.js";

function count(findings: readonly DoctorFinding[], severity: DoctorFinding["severity"]): number {
  return findings.filter((finding) => finding.severity === severity).length;
}

function list(values: readonly string[], empty = "- None."): string {
  return values.length === 0 ? empty : values.map((value) => `- ${value}`).join("\n");
}

export function renderDoctorMarkdown(input: {
  readonly generatedAt: string;
  readonly result: "passed" | "warnings" | "failed";
  readonly checks: readonly DoctorCheckResult[];
  readonly findings: readonly DoctorFinding[];
  readonly fixes: readonly DoctorFixResult[];
  readonly nextCommand: string;
}): string {
  const checkRows = input.checks
    .map((check) => `| ${check.name} | ${check.status} | ${check.findings.length} |`)
    .join("\n");
  const findingText =
    input.findings.length === 0
      ? "No findings."
      : input.findings
          .map(
            (finding) => `### ${finding.severity.toUpperCase()} ${finding.id}: ${finding.title}

Category: ${finding.category}
File: ${finding.file ?? "n/a"}

${finding.description}

Recommendation: ${finding.recommendation}
`
          )
          .join("\n");
  const fixes = input.fixes.map(
    (fix) => `${fix.applied ? "applied" : "skipped"} ${fix.path}: ${fix.reason}`
  );

  return `# Visp Doctor Report

Generated: ${input.generatedAt}

Result: ${input.result}

## Summary

- Errors: ${count(input.findings, "error")}
- Warnings: ${count(input.findings, "warning")}
- Info: ${count(input.findings, "info")}

## Checks

| Check | Status | Findings |
|-------|--------|----------|
${checkRows || "| none | passed | 0 |"}

## Findings

${findingText}

## Fixes

${list(fixes)}

## Next

${input.nextCommand}
`;
}
