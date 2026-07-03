import {
  type ReconcileChangedFile,
  type ReconcileFinding,
  type ReconcileReport
} from "../artifacts/schemas/reconcile.schema.js";
import { renderPolicyGateMarkdown } from "../gates/policy-gate-markdown.js";

function list(values: readonly string[], empty = "- None."): string {
  return values.length === 0 ? empty : values.map((value) => `- ${value}`).join("\n");
}

function count(
  findings: readonly ReconcileFinding[],
  severity: ReconcileFinding["severity"]
): number {
  return findings.filter((finding) => finding.severity === severity).length;
}

function fileRows(files: readonly ReconcileChangedFile[]): string {
  if (files.length === 0) return "| none | none | none | none |";

  return files
    .map((file) => {
      const mapping = [
        file.mappingStatus,
        ...file.relatedTaskIds,
        ...file.relatedRequirementIds,
        ...file.relatedAcceptanceCriterionIds
      ].join(" / ");
      return `| ${file.path} | ${file.changeType} | ${mapping} | ${file.notes.join("; ") || "review needed"} |`;
    })
    .join("\n");
}

function coverageRows(report: ReconcileReport): string {
  if (report.requirementCoverage.items.length === 0) {
    return "| none | none | none | none | none |";
  }

  return report.requirementCoverage.items
    .map(
      (item) =>
        `| ${item.requirementId} | ${item.acceptanceCriterionIds.join(", ") || "none"} | ${item.taskIds.join(", ") || "none"} | ${item.filePaths.join(", ") || "none"} | ${item.status} |`
    )
    .join("\n");
}

function findingsMarkdown(findings: readonly ReconcileFinding[]): string {
  if (findings.length === 0) return "No drift findings.";

  return findings
    .map(
      (finding) => `### ${finding.severity.toUpperCase()} ${finding.id}: ${finding.title}

File:
${finding.file ?? "n/a"}

Evidence:
${finding.evidence}

Recommendation:
${finding.recommendation}
`
    )
    .join("\n");
}

export function renderReconcileMarkdown(report: ReconcileReport): string {
  return `# Reconciliation Report: ${report.taskId ?? "Feature"}

## Summary

- Feature: ${report.featureId}-${report.featureSlug}
- Task: ${report.taskId ?? "feature-level"}
- Result: ${report.result}
- Changed files: ${report.changedFiles.length}
- Drift findings: ${count(report.findings, "error")} errors, ${count(report.findings, "warning")} warnings
- Verification: ${report.verificationEvidence.status}
- Review: ${report.reviewEvidence.status}
- Traceability updated: ${report.traceabilityUpdate.performed ? "yes" : "no"}

${renderPolicyGateMarkdown(report.policyGate)}

## Task Alignment

| Check | Result | Notes |
|-------|--------|-------|
| Task exists | ${report.taskAlignment.taskExists ? "passed" : "failed"} | ${report.taskId ?? "feature-level"} |
| Requirement links | ${report.taskAlignment.requirementLinks.length > 0 ? "passed" : "failed"} | ${report.taskAlignment.requirementLinks.join(", ") || "none"} |
| Acceptance criteria links | ${report.taskAlignment.acceptanceCriterionLinks.length > 0 ? "passed" : "warning"} | ${report.taskAlignment.acceptanceCriterionLinks.join(", ") || "none"} |
| Changed files in scope | ${report.taskAlignment.changedFilesInScope ? "passed" : "warning"} | ${report.fileMapping.unmappedFiles.length} unmapped file(s) |

## Changed Files

| File | Change | Mapping | Notes |
|------|--------|---------|-------|
${fileRows(report.changedFiles)}

## Requirement Coverage

| Requirement | Acceptance Criteria | Task | Files | Status |
|-------------|---------------------|------|-------|--------|
${coverageRows(report)}

## Verification Evidence

- Report: ${report.verificationEvidence.reportPath ?? "missing"}
- Result: ${report.verificationEvidence.status}
- Summary: ${report.verificationEvidence.summary.join(", ") || "none"}

## Review Evidence

- Report: ${report.reviewEvidence.reportPath ?? "missing"}
- Result: ${report.reviewEvidence.status}
- Summary: ${report.reviewEvidence.summary.join(", ") || "none"}

## Drift Findings

${findingsMarkdown(report.findings)}

## Follow-up Suggestions

${list(report.followUpSuggestions)}

## Traceability Update

Traceability was ${report.traceabilityUpdate.performed ? "updated" : "not updated"}.

${report.traceabilityUpdate.performed ? `Updated files:\n${list(report.traceabilityUpdate.updatedFiles)}` : `Skipped reason:\n${report.traceabilityUpdate.skippedReason ?? "not requested"}`}

## Warnings

${list(report.warnings)}

## Errors

${list(report.errors)}

## Next Step

${report.nextCommand}
`;
}
