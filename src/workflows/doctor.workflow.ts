import path from "node:path";

import { doctorReportArtifactPath } from "../artifacts/artifact-paths.js";
import { type CommandRunner } from "../core/command-runner.js";
import { type VispError } from "../core/errors.js";
import { writeTextFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { ok, type Result } from "../core/result.js";
import {
  type DoctorCheckName,
  type DoctorCheckResult,
  type DoctorFinding,
  runDoctorChecks
} from "../doctor/doctor-checks.js";
import { applySafeDoctorFixes, type DoctorFixResult } from "../doctor/doctor-fixes.js";
import { renderDoctorMarkdown } from "../doctor/doctor-report.js";
import { recommendNextStep } from "../orchestrator/next-step.js";
import { loadProjectState } from "../orchestrator/project-state.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";

export type DoctorWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly check?: "all" | DoctorCheckName;
  readonly fix?: boolean;
  readonly dryRun?: boolean;
  readonly verbose?: boolean;
  readonly json?: boolean;
  readonly now?: string;
  readonly commandRunner?: CommandRunner;
};

export type DoctorSummary = {
  readonly success: boolean;
  readonly targetPath: string;
  readonly result: "passed" | "warnings" | "failed";
  readonly checks: readonly {
    readonly name: string;
    readonly status: string;
  }[];
  readonly findings: readonly DoctorFinding[];
  readonly fixesApplied: readonly DoctorFixResult[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly reportPath: string | null;
  readonly nextCommand: string;
};

function resultFromFindings(findings: readonly DoctorFinding[]): "passed" | "warnings" | "failed" {
  if (findings.some((finding) => finding.severity === "error")) return "failed";
  if (findings.some((finding) => finding.severity === "warning")) return "warnings";
  return "passed";
}

export async function runDoctorWorkflow(
  options: DoctorWorkflowOptions = {}
): Promise<Result<DoctorSummary, VispError>> {
  const check = options.check ?? "all";
  const validChecks = ["all", "project", "artifacts", "agent", "git", "cache", "schemas"];

  if (!validChecks.includes(check)) {
    return ok({
      success: false,
      targetPath: path.resolve(options.cwd ?? process.cwd(), options.targetPath ?? "."),
      result: "failed",
      checks: [],
      findings: [],
      fixesApplied: [],
      warnings: [],
      errors: [`Unknown doctor check: ${check}.`],
      reportPath: null,
      nextCommand: "visp-kit doctor --check all"
    });
  }

  const state = await loadProjectState(options);

  if (!state.ok) return state;

  const checks = await runDoctorChecks({
    state: state.value,
    check
  });
  const findings = checks.flatMap((check) => check.findings);
  const result = resultFromFindings(findings);
  const fixes =
    options.fix && state.value.initialized
      ? await applySafeDoctorFixes({
          targetPath: state.value.targetPath,
          dryRun: options.dryRun
        })
      : [];
  const next = recommendNextStep({ state: state.value });
  let reportPath: string | null = null;

  if (state.value.initialized && !options.dryRun) {
    const absolute = doctorReportArtifactPath(state.value.targetPath);
    const write = await writeTextFile(
      absolute,
      renderDoctorMarkdown({
        generatedAt: options.now ?? new Date().toISOString(),
        result,
        checks,
        findings,
        fixes,
        nextCommand: next.nextCommand
      })
    );

    if (!write.ok) return write;
    reportPath = relativePath(state.value.targetPath, absolute);
  }

  return ok({
    success: result !== "failed",
    targetPath: state.value.targetPath,
    result,
    checks: checks.map((check: DoctorCheckResult) => ({
      name: check.name,
      status: check.status
    })),
    findings,
    fixesApplied: fixes,
    warnings: findings
      .filter((finding) => finding.severity === "warning")
      .map((finding) => `${finding.id}: ${finding.title}`),
    errors: findings
      .filter((finding) => finding.severity === "error")
      .map((finding) => `${finding.id}: ${finding.title}`),
    reportPath,
    nextCommand: next.nextCommand
  });
}

function count(summary: DoctorSummary, severity: DoctorFinding["severity"]): number {
  return summary.findings.filter((finding) => finding.severity === severity).length;
}

export function formatDoctorSummary(summary: DoctorSummary): string {
  const lines = [
    formatHeader("Visp doctor"),
    "",
    formatKeyValue("Result", summary.result),
    "",
    "Checks:",
    ...summary.checks.map((check) => `  ${check.name}: ${check.status}`),
    "",
    "Findings:",
    `  Errors: ${count(summary, "error")}`,
    `  Warnings: ${count(summary, "warning")}`,
    `  Info: ${count(summary, "info")}`
  ];

  if (summary.findings.length > 0) {
    lines.push(
      "",
      "Issues:",
      ...summary.findings.map((finding) => `  ${finding.id}: ${finding.title}`)
    );
  }

  if (summary.reportPath !== null) {
    lines.push("", "Report:", `  ${summary.reportPath}`);
  }

  lines.push("", "Recommended:", `  ${summary.nextCommand}`);

  return `${lines.join("\n")}\n`;
}
