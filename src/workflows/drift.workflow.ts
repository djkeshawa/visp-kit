import { readdir } from "node:fs/promises";
import path from "node:path";

import {
  contextPacksArtifactDir,
  driftReportArtifactPath,
  driftReportMarkdownPath,
  testMapArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import { contextPackSchema, type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
import { driftReportSchema, type DriftReport } from "../artifacts/schemas/drift.schema.js";
import {
  implementMarkerSchema,
  type ImplementMarker
} from "../artifacts/schemas/implement-marker.schema.js";
import { type CommandRunner } from "../core/command-runner.js";
import { VispError } from "../core/errors.js";
import { pathExists, readJsonFile, writeTextFile } from "../core/file-system.js";
import { hashFile } from "../scanner/hash.js";
import { relativePath, resolvePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import {
  runDriftChecks,
  summarizeDriftFindings,
  type CurrentFileState
} from "../drift/drift-checks.js";
import { driftResult, renderDriftMarkdown } from "../drift/drift-report.js";
import { implementMarkerPath } from "../gates/implement-marker.js";
import { loadProjectState } from "../orchestrator/project-state.js";
import { loadEffectivePolicy } from "../policy/policy-loader.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { recordWorkflowRun } from "./shared/run-recorder.js";

export type DriftWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly strict?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
  readonly now?: string;
  readonly commandRunner?: CommandRunner;
};

async function readContextPacks(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly taskId?: string;
  readonly warnings: string[];
}): Promise<readonly ContextPack[]> {
  const dir = contextPacksArtifactDir(input.targetPath, input.featureKey);
  let entries: readonly string[];

  try {
    entries = (await readdir(dir)).filter((name) => name.endsWith(".context.json"));
  } catch {
    return [];
  }

  const packs: ContextPack[] = [];

  for (const name of entries) {
    if (input.taskId !== undefined && !name.startsWith(`${input.taskId}.`)) continue;

    const pack = await readArtifact(path.join(dir, name), contextPackSchema, {
      artifactName: "context pack"
    });

    if (pack.ok) {
      packs.push(pack.value);
    } else {
      input.warnings.push(`Context pack ${name} is unreadable: ${pack.error.message}`);
    }
  }

  return packs;
}

async function readImplementMarker(targetPath: string): Promise<ImplementMarker | undefined> {
  const raw = await readJsonFile<unknown>(implementMarkerPath(targetPath));

  if (!raw.ok) return undefined;

  const parsed = implementMarkerSchema.safeParse(raw.value);

  return parsed.success ? parsed.data : undefined;
}

async function readTestMapPaths(targetPath: string): Promise<readonly string[]> {
  const raw = await readJsonFile<{ readonly testFiles?: readonly { readonly path?: unknown }[] }>(
    testMapArtifactPath(targetPath)
  );

  if (!raw.ok) return [];

  return (raw.value.testFiles ?? [])
    .map((entry) => entry.path)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

async function buildCurrentFileState(input: {
  readonly targetPath: string;
  readonly existencePaths: readonly string[];
  readonly hashPaths: readonly string[];
}): Promise<CurrentFileState> {
  const presence = new Map<string, boolean>();
  const hashes = new Map<string, string>();

  for (const relative of new Set([...input.existencePaths, ...input.hashPaths])) {
    const absolute = resolvePath(input.targetPath, relative);
    const exists = await pathExists(absolute);

    presence.set(relative, exists.ok && exists.value);
  }

  for (const relative of new Set(input.hashPaths)) {
    if (presence.get(relative) !== true) continue;

    try {
      hashes.set(relative, await hashFile(resolvePath(input.targetPath, relative)));
    } catch {
      // Unreadable files count as missing for drift purposes.
      presence.set(relative, false);
    }
  }

  return {
    exists: (candidate) => presence.get(candidate) === true,
    hash: (candidate) => hashes.get(candidate)
  };
}

export async function runDriftWorkflow(
  options: DriftWorkflowOptions = {}
): Promise<Result<DriftReport, VispError>> {
  const targetPath = resolvePath(options.cwd ?? process.cwd(), options.targetPath ?? ".");
  const now = options.now ?? new Date().toISOString();
  const dryRun = options.dryRun ?? false;
  const warnings: string[] = [];
  const state = await loadProjectState({
    targetPath,
    feature: options.feature,
    taskId: options.taskId,
    commandRunner: options.commandRunner
  });

  if (!state.ok) return state;

  if (!state.value.initialized) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Visp Kit is not initialized. Run `visp-kit init` first.",
        {
          recovery: "visp-kit init"
        }
      )
    );
  }

  const policy = await loadEffectivePolicy({ targetPath, now });

  if (!policy.ok) return policy;

  const featureKey = state.value.selectedFeature?.key;
  const contextPacks =
    featureKey === undefined
      ? []
      : await readContextPacks({
          targetPath,
          featureKey,
          taskId: options.taskId,
          warnings
        });
  const marker = await readImplementMarker(targetPath);
  const testMapPaths = await readTestMapPaths(targetPath);
  const taskGraph = state.value.taskGraph;
  const scopePaths =
    taskGraph?.tasks.flatMap((task) => [
      ...task.allowedFiles,
      ...(task.expectedFiles ?? []),
      ...(task.forbiddenFiles ?? [])
    ]) ?? [];
  const traceabilityTestPaths =
    state.value.traceability?.entries.flatMap((entry) => entry.testPaths) ?? [];
  const hashPaths = contextPacks.flatMap((pack) => [
    ...pack.artifactProvenance.map((provenance) => provenance.path),
    ...pack.includedFiles.map((file) => file.path)
  ]);
  const files = await buildCurrentFileState({
    targetPath,
    existencePaths: [...scopePaths, ...testMapPaths, ...traceabilityTestPaths],
    hashPaths
  });

  const findings = runDriftChecks({
    taskGraph,
    spec: state.value.spec,
    verification: state.value.verification,
    traceability: state.value.traceability,
    marker,
    contextPacks,
    testMapPaths,
    files
  });
  const result = driftResult(findings);
  const errorMessages = findings
    .filter((finding) => finding.severity === "error")
    .map((finding) => finding.evidence);
  const reportPath = relativePath(targetPath, driftReportMarkdownPath(targetPath));
  const jsonPath = relativePath(targetPath, driftReportArtifactPath(targetPath));
  const report: DriftReport = {
    success: result !== "failed",
    targetPath,
    featureId: state.value.selectedFeature?.id ?? null,
    featureSlug: state.value.selectedFeature?.slug ?? null,
    generatedAt: now,
    strictnessMode: policy.value.policy.strictnessMode,
    result,
    findings: [...findings],
    summary: summarizeDriftFindings(findings),
    warnings: [
      ...warnings,
      ...findings
        .filter((finding) => finding.severity === "warning")
        .map((finding) => finding.evidence)
    ],
    errors: errorMessages,
    reportPath: dryRun ? null : reportPath,
    jsonPath: dryRun ? null : jsonPath,
    nextCommand:
      result === "passed"
        ? "visp-kit next"
        : ((findings.find((finding) => finding.severity === "error") ?? findings[0])
            ?.recommendation ?? "visp-kit next")
  };

  if (!dryRun) {
    const jsonWrite = await writeArtifact(
      driftReportArtifactPath(targetPath),
      driftReportSchema,
      report,
      { artifactName: "drift report" }
    );

    if (!jsonWrite.ok) return jsonWrite;

    const markdownWrite = await writeTextFile(
      driftReportMarkdownPath(targetPath),
      renderDriftMarkdown(report)
    );

    if (!markdownWrite.ok) return markdownWrite;
  }

  const run = await recordWorkflowRun({
    targetPath,
    command: "drift",
    endedAt: now,
    feature: state.value.selectedFeature,
    taskId: options.taskId ?? state.value.selectedTask?.id,
    success: report.success,
    result: report.result,
    actions: dryRun
      ? []
      : [
          { path: jsonPath, action: "updated" },
          { path: reportPath, action: "updated" }
        ],
    warnings: report.warnings,
    errors: report.errors,
    dryRun
  });

  if (run.warnings.length > 0) {
    return ok({ ...report, warnings: [...report.warnings, ...run.warnings] });
  }

  return ok(report);
}

export function formatDriftSummary(report: DriftReport): string {
  const errors = report.findings.filter((finding) => finding.severity === "error");
  const findingLines =
    report.findings.length === 0
      ? ["  none"]
      : report.findings.map(
          (finding) =>
            `  ${finding.severity.toUpperCase()} ${finding.id} ${finding.kind}${
              finding.file === null ? "" : ` (${finding.file})`
            }`
        );
  const lines = [
    formatHeader("Visp drift"),
    "",
    formatKeyValue("Result", report.result),
    formatKeyValue(
      "Feature",
      report.featureId === null ? "none" : `${report.featureId}-${report.featureSlug ?? ""}`
    ),
    formatKeyValue("Errors", String(errors.length)),
    formatKeyValue("Warnings", String(report.findings.length - errors.length)),
    "",
    "Findings:",
    ...findingLines
  ];

  if (report.reportPath !== null) {
    lines.push("", "Report:", `  ${report.reportPath}`);
  }

  lines.push("", "Next:", `  ${report.nextCommand}`);

  return `${lines.join("\n")}\n`;
}
