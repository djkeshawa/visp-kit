import {
  type ReviewChangedFile,
  type ReviewFinding,
  type ReviewReport
} from "../artifacts/schemas/review.schema.js";
import { renderPolicyGateMarkdown } from "../gates/policy-gate-markdown.js";

function list(values: readonly string[], empty = "- None."): string {
  return values.length === 0 ? empty : values.map((value) => `- ${value}`).join("\n");
}

function findingCount(findings: readonly ReviewFinding[], severity: ReviewFinding["severity"]): number {
  return findings.filter((finding) => finding.severity === severity).length;
}

function changedFileRows(files: readonly ReviewChangedFile[]): string {
  if (files.length === 0) {
    return "| none | none | 0 | 0 | none |";
  }

  return files
    .map((file) => {
      const scope = file.inForbiddenFiles
        ? "forbidden"
        : file.inAllowedFiles ? "allowed"
        : file.inExpectedFiles ? "expected"
        : file.isGeneratedVispFile ? "generated"
        : "unmapped";

      return `| ${file.path} | ${file.changeType} | ${file.additions} | ${file.deletions} | ${scope} |`;
    })
    .join("\n");
}

function findingsMarkdown(findings: readonly ReviewFinding[]): string {
  if (findings.length === 0) return "No findings.";

  return findings
    .map(
      (finding) => `### ${finding.severity.toUpperCase()} ${finding.id}: ${finding.title}

Category:
${finding.category}

Evidence:
${finding.evidence}

Recommendation:
${finding.recommendation}
`
    )
    .join("\n");
}

function securityChecklist(report: ReviewReport): string {
  return report.securityChecklist
    .map((item) => `- [ ] ${item.text}`)
    .join("\n");
}

export function renderReviewMarkdown(report: ReviewReport): string {
  const errors = findingCount(report.findings, "error");
  const warnings = findingCount(report.findings, "warning");
  const info = findingCount(report.findings, "info");

  return `# Review Report: ${report.taskId ?? "Feature"}

## Summary

- Feature: ${report.featureId}-${report.featureSlug}
- Task: ${report.taskId ?? "feature-level"}
- Result: ${report.result}
- Changed files: ${report.changedFiles.length}
- Findings: ${errors} errors, ${warnings} warnings, ${info} info
- Verification: ${report.verificationReview.status}

${renderPolicyGateMarkdown(report.policyGate)}

## Changed Files

| File | Change | Additions | Deletions | Scope |
|------|--------|-----------|-----------|-------|
${changedFileRows(report.changedFiles)}

## Task Scope

Allowed files:
${list(report.scopeReview.allowedFiles)}

Expected files:
${list(report.scopeReview.expectedFiles)}

Forbidden files:
${list(report.scopeReview.forbiddenFiles)}

Scope result:
${report.scopeReview.status}

## Requirement Traceability

| Requirement | Acceptance Criteria | Status |
|-------------|---------------------|--------|
| ${report.traceabilityReview.requirementIds.join(", ") || "none"} | ${report.traceabilityReview.acceptanceCriterionIds.join(", ") || "none"} | ${report.traceabilityReview.status} |

## Verification Evidence

- Report: ${report.verificationReview.reportPath ?? "missing"}
- Result: ${report.verificationReview.status}

## Findings

${findingsMarkdown(report.findings)}

## Test Review

- Tests changed: ${report.testReview.testsChanged ? "yes" : "no"}
- Validation commands known: ${report.testReview.validationCommandsKnown ? "yes" : "no"}
- Verification commands passed: ${report.testReview.verificationCommandsPassed ? "yes" : "no"}

## Dependency Review

- Dependency files changed: ${report.dependencyReview.changedDependencyFiles.length > 0 ? "yes" : "no"}
- Approval status: ${
    report.dependencyReview.changedDependencyFiles.length === 0
      ? "not needed"
      : report.dependencyReview.approvedByTaskScope || report.dependencyReview.approvedByPlan
        ? "needs review"
        : "not approved"
  }

## Security and Privacy Checklist

${securityChecklist(report)}

## Codex Review Prompt

Use:

${report.promptPath ?? ".visp/prompts/review.prompt.md"}

## Warnings

${list(report.warnings)}

## Errors

${list(report.errors)}

## Next Step

${report.nextCommand}
`;
}
