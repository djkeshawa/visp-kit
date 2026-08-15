import { type ReconcileChangedFile } from "../artifacts/schemas/reconcile.schema.js";
import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { type TraceabilityMatrix } from "../artifacts/schemas/traceability.schema.js";
import { type LoadedDiffFile } from "../review/diff-loader.js";
import {
  normalizeDeclaredPathList as normalizeList,
  normalizeReviewPath
} from "../review/diff-summary.js";
import { reconcileFinding, type ReconcileFindingDraft } from "./reconcile-findings.js";

function relatedFromTraceability(input: {
  readonly filePath: string;
  readonly traceability?: TraceabilityMatrix;
}): {
  readonly taskIds: readonly string[];
  readonly requirementIds: readonly string[];
  readonly acceptanceCriterionIds: readonly string[];
} {
  const entries =
    input.traceability?.entries.filter((entry) =>
      [...entry.filePaths, ...entry.testPaths].map(normalizeReviewPath).includes(input.filePath)
    ) ?? [];

  return {
    taskIds: [...new Set(entries.flatMap((entry) => entry.taskIds))].sort(),
    requirementIds: [...new Set(entries.map((entry) => entry.requirementId))].sort(),
    acceptanceCriterionIds: [
      ...new Set(entries.flatMap((entry) => entry.acceptanceCriterionIds))
    ].sort()
  };
}

function allTaskScope(taskGraph: TaskGraphArtifact): {
  readonly allowed: readonly string[];
  readonly expected: readonly string[];
  readonly forbidden: readonly string[];
} {
  return {
    allowed: normalizeList(taskGraph.tasks.flatMap((task) => task.allowedFiles)),
    expected: normalizeList(taskGraph.tasks.flatMap((task) => task.expectedFiles ?? [])),
    forbidden: normalizeList(taskGraph.tasks.flatMap((task) => task.forbiddenFiles ?? []))
  };
}

function taskScope(input: { readonly task?: Task; readonly taskGraph: TaskGraphArtifact }): {
  readonly allowed: readonly string[];
  readonly expected: readonly string[];
  readonly forbidden: readonly string[];
} {
  if (input.task === undefined) return allTaskScope(input.taskGraph);

  return {
    allowed: normalizeList(input.task.allowedFiles),
    expected: normalizeList(input.task.expectedFiles),
    forbidden: normalizeList(input.task.forbiddenFiles)
  };
}

export function reconcileDiff(input: {
  readonly files: readonly LoadedDiffFile[];
  readonly task?: Task;
  readonly taskGraph: TaskGraphArtifact;
  readonly traceability?: TraceabilityMatrix;
}): {
  readonly changedFiles: readonly ReconcileChangedFile[];
  readonly fileMapping: {
    readonly status: "passed" | "warnings" | "failed";
    readonly mappedFiles: readonly string[];
    readonly unmappedFiles: readonly string[];
    readonly forbiddenFiles: readonly string[];
    readonly dependencyFiles: readonly string[];
    readonly generatedFiles: readonly string[];
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
  };
  readonly findings: readonly ReconcileFindingDraft[];
} {
  const scope = taskScope(input);
  const forbidden = new Set(scope.forbidden);
  const findings: ReconcileFindingDraft[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const changedFiles = input.files.map((file) => {
    const path = file.path;
    const trace = relatedFromTraceability({ filePath: path, traceability: input.traceability });
    const isAllowedByTask = scope.allowed.includes(path);
    const isExpectedByTask = scope.expected.includes(path);
    const isForbiddenByTask = forbidden.has(path);
    const generated = file.isGeneratedVispFile;
    const relatedTaskIds = [
      ...new Set([
        ...(isAllowedByTask || isExpectedByTask
          ? ([input.task?.id].filter(Boolean) as string[])
          : []),
        ...trace.taskIds
      ])
    ].sort();
    const relatedRequirementIds = [
      ...new Set([
        ...(input.task !== undefined && (isAllowedByTask || isExpectedByTask)
          ? input.task.requirementIds
          : []),
        ...trace.requirementIds
      ])
    ].sort();
    const relatedAcceptanceCriterionIds = [
      ...new Set([
        ...(input.task !== undefined && (isAllowedByTask || isExpectedByTask)
          ? input.task.acceptanceCriterionIds
          : []),
        ...trace.acceptanceCriterionIds
      ])
    ].sort();
    const mapped =
      relatedTaskIds.length > 0 ||
      relatedRequirementIds.length > 0 ||
      isAllowedByTask ||
      isExpectedByTask;
    const mappingStatus = generated
      ? "generated"
      : isForbiddenByTask
        ? "forbidden"
        : file.isDependencyFile
          ? "dependency"
          : mapped
            ? "mapped"
            : "unmapped";
    const notes = [
      ...(isAllowedByTask ? ["allowed by task"] : []),
      ...(isExpectedByTask ? ["expected by task"] : []),
      ...(isForbiddenByTask ? ["forbidden by task"] : []),
      ...(trace.taskIds.length > 0 ? ["mapped by traceability"] : []),
      ...(generated ? ["generated Visp artifact"] : [])
    ];

    return {
      path,
      changeType: file.changeType,
      additions: file.additions,
      deletions: file.deletions,
      mappingStatus,
      isTestFile: file.isTestFile,
      isDependencyFile: file.isDependencyFile,
      isVispGeneratedFile: generated,
      isAllowedByTask,
      isExpectedByTask,
      isForbiddenByTask,
      relatedTaskIds,
      relatedRequirementIds,
      relatedAcceptanceCriterionIds,
      notes
    } satisfies ReconcileChangedFile;
  });

  const implementationFiles = changedFiles.filter((file) => !file.isVispGeneratedFile);
  const forbiddenFiles = implementationFiles
    .filter((file) => file.mappingStatus === "forbidden")
    .map((file) => file.path);
  const unmappedFiles = implementationFiles
    .filter((file) => file.mappingStatus === "unmapped")
    .map((file) => file.path);

  for (const filePath of forbiddenFiles) {
    const message = `Forbidden file changed: ${filePath}.`;
    errors.push(message);
    findings.push(
      reconcileFinding({
        category: "file-mapping",
        severity: "error",
        driftType: "changed_forbidden_file",
        title: "Forbidden file changed",
        description: "A changed file is listed in forbiddenFiles.",
        file: filePath,
        evidence: message,
        recommendation: "Revert the change or update task scope with explicit approval.",
        relatedTaskId: input.task?.id ?? null,
        relatedRequirementIds: input.task?.requirementIds ?? [],
        relatedAcceptanceCriterionIds: input.task?.acceptanceCriterionIds ?? []
      })
    );
  }

  for (const filePath of unmappedFiles) {
    const severity = input.task !== undefined && scope.allowed.length > 0 ? "error" : "warning";
    const message = `File is present in Git diff but not mapped to task scope or traceability: ${filePath}.`;

    if (severity === "error") errors.push(message);
    else warnings.push(message);

    findings.push(
      reconcileFinding({
        category: "file-mapping",
        severity,
        driftType: "unmapped_file_change",
        title: "Unmapped file change",
        description:
          "A changed file has no deterministic task, requirement, or acceptance criterion mapping.",
        file: filePath,
        evidence: message,
        recommendation:
          "Confirm the change is intentional. Update task scope or create a follow-up task.",
        relatedTaskId: input.task?.id ?? null
      })
    );
  }

  return {
    changedFiles,
    fileMapping: {
      status: errors.length > 0 ? "failed" : warnings.length > 0 ? "warnings" : "passed",
      mappedFiles: changedFiles
        .filter((file) => file.mappingStatus === "mapped")
        .map((file) => file.path),
      unmappedFiles,
      forbiddenFiles,
      dependencyFiles: changedFiles
        .filter((file) => file.isDependencyFile)
        .map((file) => file.path),
      generatedFiles: changedFiles
        .filter((file) => file.isVispGeneratedFile)
        .map((file) => file.path),
      warnings,
      errors
    },
    findings
  };
}
