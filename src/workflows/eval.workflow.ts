import path from "node:path";

import {
  evaluationReportArtifactPath,
  evaluationReportMarkdownPath
} from "../artifacts/artifact-paths.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import {
  evaluationReportSchema,
  type EvaluationReport
} from "../artifacts/schemas/evaluation.schema.js";
import { VispError } from "../core/errors.js";
import { relativePath } from "../core/paths.js";
import { ok, type Result } from "../core/result.js";
import { writeTextFile } from "../core/file-system.js";
import { evaluateProject } from "../evaluation/evaluation-engine.js";
import { renderEvaluationMarkdown } from "../evaluation/evaluation-report.js";
import { recommendNextStep } from "../orchestrator/next-step.js";
import { loadProjectState } from "../orchestrator/project-state.js";
import { type CommandRunner } from "../core/command-runner.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { recordWorkflowRun } from "./shared/run-recorder.js";

export type EvalWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly strict?: boolean;
  readonly writeReport?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
  readonly now?: string;
  readonly commandRunner?: CommandRunner;
};

export async function runEvalWorkflow(
  options: EvalWorkflowOptions = {}
): Promise<Result<EvaluationReport, VispError>> {
  const targetPath = path.resolve(options.cwd ?? process.cwd(), options.targetPath ?? ".");
  const now = options.now ?? new Date().toISOString();
  const dryRun = options.dryRun ?? false;
  const writeReport = options.writeReport ?? true;
  const state = await loadProjectState({
    targetPath,
    feature: options.feature,
    taskId: options.taskId,
    commandRunner: options.commandRunner
  });

  if (!state.ok) return state;

  const next = recommendNextStep({
    state: state.value,
    taskId: options.taskId,
    strict: options.strict
  });
  const reportPath = writeReport
    ? relativePath(targetPath, evaluationReportMarkdownPath(targetPath))
    : null;
  const jsonPath = writeReport
    ? relativePath(targetPath, evaluationReportArtifactPath(targetPath))
    : null;
  const report = evaluateProject({
    state: state.value,
    next,
    strict: options.strict ?? false,
    generatedAt: now,
    reportPath,
    jsonPath
  });

  if (writeReport && !dryRun) {
    const jsonWrite = await writeArtifact(
      evaluationReportArtifactPath(targetPath),
      evaluationReportSchema,
      report,
      { artifactName: "evaluation report" }
    );

    if (!jsonWrite.ok) return jsonWrite;

    const markdownWrite = await writeTextFile(
      evaluationReportMarkdownPath(targetPath),
      renderEvaluationMarkdown(report)
    );

    if (!markdownWrite.ok) return markdownWrite;
  }

  const run = await recordWorkflowRun({
    targetPath,
    command: "eval",
    endedAt: now,
    feature: state.value.selectedFeature,
    taskId: state.value.selectedTask?.id,
    success: report.success,
    result: report.result,
    actions: writeReport
      ? [
          { path: jsonPath ?? "", action: "updated" },
          { path: reportPath ?? "", action: "updated" }
        ]
      : [],
    warnings: report.warnings,
    errors: report.errors,
    dryRun
  });

  if (run.warnings.length > 0) {
    return ok({
      ...report,
      warnings: [...report.warnings, ...run.warnings]
    });
  }

  return ok(report);
}

export function formatEvalSummary(report: EvaluationReport): string {
  const lines = [
    formatHeader("Visp evaluation"),
    "",
    formatKeyValue("Result", report.result),
    formatKeyValue("Feature", report.featureId === null ? "none" : `${report.featureId}-${report.featureSlug ?? ""}`),
    formatKeyValue("Task", report.taskId ?? "none"),
    "",
    "Findings:",
    `  Errors: ${report.errors.length}`,
    `  Warnings: ${report.warnings.length}`,
    `  Checks: ${report.checks.length}`
  ];

  if (report.reportPath !== null) {
    lines.push("", "Report:", `  ${report.reportPath}`);
  }

  lines.push("", "Next:", `  ${report.nextCommand}`);

  return `${lines.join("\n")}\n`;
}
