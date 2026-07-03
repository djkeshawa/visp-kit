import { readdir } from "node:fs/promises";
import path from "node:path";

import {
  contextPacksArtifactDir,
  driftReportArtifactPath,
  evaluationReportArtifactPath,
  evaluationReportMarkdownPath,
  fileIndexArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import { contextPackSchema } from "../artifacts/schemas/context-pack.schema.js";
import { driftReportSchema } from "../artifacts/schemas/drift.schema.js";
import {
  evaluationReportSchema,
  type BenchmarkMetrics,
  type EvaluationReport
} from "../artifacts/schemas/evaluation.schema.js";
import { type VispError } from "../core/errors.js";
import { relativePath } from "../core/paths.js";
import { ok, type Result } from "../core/result.js";
import { readJsonFile, writeTextFile } from "../core/file-system.js";
import { computeBenchmarkMetrics } from "../evaluation/benchmark-metrics.js";
import { evaluateProject } from "../evaluation/evaluation-engine.js";
import { renderEvaluationMarkdown } from "../evaluation/evaluation-report.js";
import { recommendNextStep } from "../orchestrator/next-step.js";
import { loadProjectState, type ProjectState } from "../orchestrator/project-state.js";
import { type CommandRunner } from "../core/command-runner.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { recordWorkflowRun } from "./shared/run-recorder.js";

export type EvalWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly strict?: boolean;
  readonly benchmark?: boolean;
  readonly writeReport?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
  readonly now?: string;
  readonly commandRunner?: CommandRunner;
};

async function contextTokenTotals(input: {
  readonly targetPath: string;
  readonly featureKey?: string;
}): Promise<readonly number[]> {
  if (input.featureKey === undefined) return [];

  const dir = contextPacksArtifactDir(input.targetPath, input.featureKey);
  let entries: readonly string[];

  try {
    entries = (await readdir(dir)).filter((name) => name.endsWith(".context.json"));
  } catch {
    return [];
  }

  const totals: number[] = [];

  for (const name of entries) {
    const pack = await readArtifact(path.join(dir, name), contextPackSchema, {
      artifactName: "context pack"
    });

    if (pack.ok) totals.push(pack.value.estimatedTokens.total);
  }

  return totals;
}

async function fileIndexSizes(targetPath: string): Promise<readonly number[]> {
  const raw = await readJsonFile<{
    readonly files?: readonly { readonly sizeBytes?: unknown }[];
  }>(fileIndexArtifactPath(targetPath));

  if (!raw.ok) return [];

  return (raw.value.files ?? [])
    .map((entry) => entry.sizeBytes)
    .filter((value): value is number => typeof value === "number" && value >= 0);
}

async function benchmarkMetricsFor(input: {
  readonly targetPath: string;
  readonly state: ProjectState;
}): Promise<BenchmarkMetrics> {
  const driftRaw = await readJsonFile<unknown>(driftReportArtifactPath(input.targetPath));
  const drift = driftRaw.ok ? driftReportSchema.safeParse(driftRaw.value) : undefined;

  return computeBenchmarkMetrics({
    state: input.state,
    contextTokenTotals: await contextTokenTotals({
      targetPath: input.targetPath,
      featureKey: input.state.selectedFeature?.key
    }),
    fileIndexSizeBytes: await fileIndexSizes(input.targetPath),
    drift:
      drift?.success === true
        ? {
            errors: drift.data.findings.filter((finding) => finding.severity === "error").length,
            warnings: drift.data.findings.filter((finding) => finding.severity === "warning").length
          }
        : null
  });
}

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
  const baseReport = evaluateProject({
    state: state.value,
    next,
    strict: options.strict ?? false,
    generatedAt: now,
    reportPath,
    jsonPath
  });
  const report: EvaluationReport =
    options.benchmark === true
      ? { ...baseReport, metrics: await benchmarkMetricsFor({ targetPath, state: state.value }) }
      : baseReport;

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
    formatKeyValue(
      "Feature",
      report.featureId === null ? "none" : `${report.featureId}-${report.featureSlug ?? ""}`
    ),
    formatKeyValue("Task", report.taskId ?? "none"),
    "",
    "Findings:",
    `  Errors: ${report.errors.length}`,
    `  Warnings: ${report.warnings.length}`,
    `  Checks: ${report.checks.length}`
  ];

  if (report.metrics !== undefined) {
    const efficiency = report.metrics.contextEfficiency;

    lines.push(
      "",
      "Benchmark metrics:",
      `  Context packs measured: ${efficiency.measuredTaskCount}`,
      `  Average context tokens: ${efficiency.averageContextTokens}`,
      `  Whole-repo baseline tokens: ${efficiency.wholeRepoTokenBaseline}`,
      `  Context reduction: ${
        efficiency.reductionRatio === null
          ? "n/a"
          : `${Math.round(efficiency.reductionRatio * 100)}%`
      }`,
      `  Evidence completeness: ${Math.round(report.metrics.evidenceCompleteness.ratio * 100)}%`,
      `  Artifact validation: ${
        report.metrics.artifactValidation.ratio === null
          ? "n/a"
          : `${Math.round(report.metrics.artifactValidation.ratio * 100)}%`
      }`,
      `  Drift findings: ${
        report.metrics.drift === null
          ? "no drift report"
          : `${report.metrics.drift.errors} errors, ${report.metrics.drift.warnings} warnings`
      }`
    );
  }

  if (report.reportPath !== null) {
    lines.push("", "Report:", `  ${report.reportPath}`);
  }

  lines.push("", "Next:", `  ${report.nextCommand}`);

  return `${lines.join("\n")}\n`;
}
