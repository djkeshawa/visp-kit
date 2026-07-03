import {
  type ReconcileChangedFile,
  type ReconcileResult
} from "../artifacts/schemas/reconcile.schema.js";
import {
  type TraceabilityEntry,
  type TraceabilityMatrix
} from "../artifacts/schemas/traceability.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort();
}

function entryMatchesTask(entry: TraceabilityEntry, task: Task | undefined): boolean {
  return task !== undefined && entry.taskIds.includes(task.id);
}

function entryMatchesRequirement(entry: TraceabilityEntry, file: ReconcileChangedFile): boolean {
  return file.relatedRequirementIds.includes(entry.requirementId);
}

function statusForResult(result: ReconcileResult): TraceabilityEntry["status"] {
  if (result === "passed") return "verified";
  if (result === "warnings") return "partial";
  return "partial";
}

export function updateTraceabilityForReconcile(input: {
  readonly traceability: TraceabilityMatrix;
  readonly task?: Task;
  readonly changedFiles: readonly ReconcileChangedFile[];
  readonly result: ReconcileResult;
  readonly now: string;
}): TraceabilityMatrix {
  const changed = input.changedFiles.filter(
    (file) =>
      !file.isVispGeneratedFile &&
      file.mappingStatus !== "unmapped" &&
      file.mappingStatus !== "forbidden"
  );

  return {
    ...input.traceability,
    entries: input.traceability.entries.map((entry) => {
      const related = changed.filter(
        (file) => entryMatchesTask(entry, input.task) || entryMatchesRequirement(entry, file)
      );

      if (related.length === 0) return entry;

      return {
        ...entry,
        filePaths: unique([
          ...entry.filePaths,
          ...related.filter((file) => !file.isTestFile).map((file) => file.path)
        ]),
        testPaths: unique([
          ...entry.testPaths,
          ...related.filter((file) => file.isTestFile).map((file) => file.path)
        ]),
        testRefs: unique([
          ...(entry.testRefs ?? []),
          ...related.filter((file) => file.isTestFile).map((file) => `changed:${file.path}`)
        ]),
        status: statusForResult(input.result)
      };
    }),
    updatedAt: input.now
  };
}

export function renderTraceabilityMarkdown(matrix: TraceabilityMatrix): string {
  const rows = matrix.entries
    .map(
      (entry) =>
        `| ${entry.requirementId} | ${entry.acceptanceCriterionIds.join(", ") || "none"} | ${entry.taskIds.join(", ") || "none"} | ${entry.filePaths.join(", ") || "none"} | ${entry.testPaths.join(", ") || "none"} | ${entry.status} |`
    )
    .join("\n");

  return `# Traceability Matrix

Updated: ${matrix.updatedAt}

| Requirement | Acceptance Criteria | Tasks | Files | Tests | Status |
|-------------|---------------------|-------|-------|-------|--------|
${rows || "| none | none | none | none | none | missing |"}
`;
}
