import {
  type VerificationCheckStatus,
  type VerificationReport,
  type VerificationSummary
} from "../artifacts/schemas/verification.schema.js";
import { renderPolicyGateMarkdown } from "../gates/policy-gate-markdown.js";

function list(values: readonly string[], empty = "- None."): string {
  return values.length === 0 ? empty : values.map((value) => `- ${value}`).join("\n");
}

function statusText(status: VerificationCheckStatus): string {
  return status;
}

export function createVerificationSummary(
  report: Omit<VerificationReport, "summary">
): VerificationSummary {
  const commandsRun = report.commandValidation.commands.filter((command) => !command.skipped);
  const commandsFailed = commandsRun.filter((command) => !command.success);
  const warnings = new Set([
    ...report.artifactValidation.warnings,
    ...report.traceabilityValidation.warnings,
    ...report.commandValidation.warnings,
    ...report.scopeValidation.warnings,
    ...report.dependencyValidation.warnings,
    ...report.warnings
  ]).size;
  const artifactsFailed = report.artifactValidation.checked.filter(
    (artifact) => !artifact.passed
  ).length;
  const scopeViolations =
    report.scopeValidation.outOfScopeFiles.length +
    report.scopeValidation.forbiddenChangedFiles.length;
  const dependencyViolations = report.dependencyValidation.errors.length;
  const failed =
    artifactsFailed > 0 ||
    report.traceabilityValidation.errors.length > 0 ||
    commandsFailed.length > 0 ||
    scopeViolations > 0 ||
    dependencyViolations > 0 ||
    report.errors.length > 0;

  return {
    passed: !failed,
    failed,
    warnings,
    commandsRun: commandsRun.length,
    commandsPassed: commandsRun.filter((command) => command.success).length,
    commandsFailed: commandsFailed.length,
    artifactsChecked: report.artifactValidation.checked.length,
    artifactsFailed,
    scopeViolations,
    dependencyViolations
  };
}

function artifactRows(report: VerificationReport): string {
  return report.artifactValidation.checked
    .map((artifact) => {
      const notes = [...artifact.errors, ...artifact.warnings].join("; ");
      const status = artifact.passed ? "passed" : "failed";
      return `| ${artifact.path} | ${status} | ${notes} |`;
    })
    .join("\n");
}

function commandResults(report: VerificationReport): string {
  if (report.commandValidation.commands.length === 0) {
    return "No validation commands were run.";
  }

  return report.commandValidation.commands
    .map((result) => {
      const output =
        result.stderr ||
        result.stdout ||
        result.skipReason ||
        (result.runner?.outputCaptureMode === "inherited"
          ? "Output was inherited by the terminal for compatibility and was not captured in this report."
          : "No output.");
      const runner = result.runner;
      const runnerDetails =
        runner === undefined
          ? "Runner: n/a"
          : [
              `Runner: ${runner.executionMode}`,
              `Stdio: ${runner.stdioMode}`,
              `Output capture: ${runner.outputCaptureMode}`,
              `Platform: ${runner.platform}`,
              `Shell: ${runner.shell ?? "n/a"}`,
              `Executable: ${runner.executable}`,
              `Args: ${runner.args.length === 0 ? "[]" : runner.args.join(" ")}`,
              `Profile: ${runner.profile}`,
              `Profile reason: ${runner.profileReason ?? "n/a"}`
            ].join("\n");

      return `### ${result.command}

Status: ${result.skipped ? "skipped" : result.success ? "passed" : "failed"}
Exit code: ${result.exitCode ?? "n/a"}
Duration: ${result.durationMs}ms

Command execution:

${runnerDetails}

Output summary:

\`\`\`
${output}
\`\`\`
`;
    })
    .join("\n");
}

export function renderVerificationMarkdown(report: VerificationReport): string {
  return `# Verification Report

## Feature

- ID: ${report.featureId}
- Slug: ${report.featureSlug}
- Task: ${report.taskId ?? "feature-level"}
- Mode: ${report.mode}
- Result: ${report.success ? "passed" : "failed"}
- Started: ${report.startedAt}
- Ended: ${report.endedAt}
- Duration: ${report.durationMs}ms

## Summary

- Artifacts: ${statusText(report.artifactValidation.status)}
- Traceability: ${statusText(report.traceabilityValidation.status)}
- Commands: ${statusText(report.commandValidation.status)}
- Scope: ${statusText(report.scopeValidation.status)}
- Dependencies: ${statusText(report.dependencyValidation.status)}

${renderPolicyGateMarkdown(report.policyGate)}

## Artifact Validation

| Artifact | Status | Notes |
|----------|--------|-------|
${artifactRows(report)}

## Traceability Validation

Status: ${report.traceabilityValidation.status}

Findings:
${list([...report.traceabilityValidation.errors, ...report.traceabilityValidation.warnings])}

## Command Results

${commandResults(report)}

## Scope Validation

Changed files:
${list(report.scopeValidation.changedFiles)}

Out-of-scope files:
${list(report.scopeValidation.outOfScopeFiles)}

Forbidden changes:
${list(report.scopeValidation.forbiddenChangedFiles)}

## Dependency Validation

Changed dependency files:
${list(report.dependencyValidation.changedDependencyFiles)}

## Warnings

${list(report.warnings)}

## Errors

${list(report.errors)}

## Next Step

${report.nextCommand}
`;
}
