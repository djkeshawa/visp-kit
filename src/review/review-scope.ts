import { type ReviewChangedFile } from "../artifacts/schemas/review.schema.js";
import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { type LoadedDiffFile } from "./diff-loader.js";
import { normalizeReviewPath } from "./diff-summary.js";
import { finding, type ReviewFindingDraft } from "./review-findings.js";

function normalizeList(values: readonly string[] | undefined): readonly string[] {
  return [
    ...new Set(
      (values ?? [])
        .map(normalizeReviewPath)
        .filter((value) => value.length > 0 && value.toUpperCase() !== "TBD")
    )
  ].sort();
}

function taskFiles(input: {
  readonly task?: Task;
  readonly taskGraph: TaskGraphArtifact;
  readonly field: "allowedFiles" | "expectedFiles" | "forbiddenFiles";
}): readonly string[] {
  if (input.task !== undefined) {
    return normalizeList(input.task[input.field]);
  }

  return normalizeList(input.taskGraph.tasks.flatMap((task) => task[input.field] ?? []));
}

export function reviewScope(input: {
  readonly files: readonly LoadedDiffFile[];
  readonly task?: Task;
  readonly taskGraph: TaskGraphArtifact;
  /**
   * Files already modified when implementation was authorized, from the
   * implement marker. Scope is diffed against the feature base commit, so
   * without this an earlier task's uncommitted work is reported as if this task
   * changed it. These are still surfaced, but as pre-existing rather than as a
   * scope violation by the current task.
   */
  readonly preExistingChangedFiles?: readonly string[];
}): {
  readonly changedFiles: readonly ReviewChangedFile[];
  readonly scopeReview: {
    readonly status: "passed" | "warnings" | "failed";
    readonly allowedFiles: readonly string[];
    readonly expectedFiles: readonly string[];
    readonly forbiddenFiles: readonly string[];
    readonly outOfScopeFiles: readonly string[];
    readonly preExistingOutOfScopeFiles: readonly string[];
    readonly forbiddenChangedFiles: readonly string[];
    readonly unmappedChangedFiles: readonly string[];
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
  };
  readonly findings: readonly ReviewFindingDraft[];
} {
  const allowedFiles = taskFiles({ ...input, field: "allowedFiles" });
  const expectedFiles = taskFiles({ ...input, field: "expectedFiles" });
  const forbiddenFiles = taskFiles({ ...input, field: "forbiddenFiles" });
  const allowedSet = new Set([...allowedFiles, ...expectedFiles]);
  const forbiddenSet = new Set(forbiddenFiles);
  const changedFiles = input.files.map((file) => ({
    ...file,
    inAllowedFiles: allowedFiles.includes(file.path),
    inExpectedFiles: expectedFiles.includes(file.path),
    inForbiddenFiles: forbiddenSet.has(file.path)
  }));
  const implementationFiles = changedFiles.filter((file) => !file.isGeneratedVispFile);
  const warnings: string[] = [];
  const errors: string[] = [];
  const findings: ReviewFindingDraft[] = [];
  const forbiddenChangedFiles = implementationFiles
    .filter((file) => file.inForbiddenFiles)
    .map((file) => file.path);
  // Files dirty before this task was authorized are attributed to earlier work,
  // not to the current task. They are still reported, but as pre-existing.
  const preExistingSet = new Set(normalizeList(input.preExistingChangedFiles ?? []));
  const allOutOfScope =
    input.task !== undefined && allowedFiles.length > 0
      ? implementationFiles.filter((file) => !allowedSet.has(file.path)).map((file) => file.path)
      : [];
  const outOfScopeFiles = allOutOfScope.filter((filePath) => !preExistingSet.has(filePath));
  const preExistingOutOfScopeFiles = allOutOfScope.filter((filePath) =>
    preExistingSet.has(filePath)
  );
  const unmappedChangedFiles =
    input.task === undefined && allowedSet.size > 0
      ? implementationFiles.filter((file) => !allowedSet.has(file.path)).map((file) => file.path)
      : [];

  if (input.task !== undefined && allowedFiles.length === 0) {
    warnings.push("Selected task has no allowedFiles; scope review is advisory.");
    findings.push(
      finding({
        category: "scope",
        severity: "warning",
        title: "Task file scope is missing",
        description: "The selected task does not declare allowed files.",
        evidence: "allowedFiles is empty.",
        recommendation: "Add allowedFiles to the task graph or manually justify changed files.",
        relatedTaskId: input.task.id,
        relatedRequirementIds: input.task.requirementIds,
        relatedAcceptanceCriterionIds: input.task.acceptanceCriterionIds
      })
    );
  }

  if (input.task === undefined && allowedSet.size === 0) {
    warnings.push("No task file scope is available; feature-level review is advisory.");
  }

  for (const filePath of forbiddenChangedFiles) {
    const message = `Forbidden file changed: ${filePath}.`;
    errors.push(message);
    findings.push(
      finding({
        category: "scope",
        severity: "error",
        title: "Forbidden file changed",
        description: "A changed file is listed in forbiddenFiles for the selected scope.",
        file: filePath,
        evidence: message,
        recommendation: "Revert this change or update the task scope with explicit approval.",
        relatedTaskId: input.task?.id ?? null,
        relatedRequirementIds: input.task?.requirementIds ?? [],
        relatedAcceptanceCriterionIds: input.task?.acceptanceCriterionIds ?? []
      })
    );
  }

  for (const filePath of preExistingOutOfScopeFiles) {
    const message =
      `Pre-existing change outside task scope: ${filePath}. ` +
      "This file was already modified when implementation was authorized, so it " +
      "is attributed to earlier uncommitted work rather than to this task. " +
      "Commit or revert it so scope reflects only the current task.";
    warnings.push(message);
    findings.push(
      finding({
        category: "scope",
        severity: "warning",
        title: "Pre-existing change outside task scope",
        description:
          "Scope is diffed against the feature base commit, and this file was already changed before this task was authorized.",
        file: filePath,
        evidence: message,
        recommendation:
          "Commit the earlier task's accepted work, or revert it, so scope reflects only this task.",
        relatedTaskId: input.task?.id ?? null,
        relatedRequirementIds: input.task?.requirementIds ?? [],
        relatedAcceptanceCriterionIds: input.task?.acceptanceCriterionIds ?? []
      })
    );
  }

  for (const filePath of outOfScopeFiles) {
    const message = `Out-of-scope file changed: ${filePath}.`;
    errors.push(message);
    findings.push(
      finding({
        category: "scope",
        severity: "error",
        title: "Out-of-scope file changed",
        description: "The selected task has allowed files, and this changed file is outside them.",
        file: filePath,
        evidence: message,
        recommendation:
          "Keep the implementation inside allowedFiles or split/expand the task scope.",
        relatedTaskId: input.task?.id ?? null,
        relatedRequirementIds: input.task?.requirementIds ?? [],
        relatedAcceptanceCriterionIds: input.task?.acceptanceCriterionIds ?? []
      })
    );
  }

  if (unmappedChangedFiles.length > 0) {
    const message = `Changed file is not mapped to any task: ${unmappedChangedFiles.join(", ")}.`;
    warnings.push(message);
    findings.push(
      finding({
        category: "scope",
        severity: "warning",
        title: "Changed files are not mapped to a task",
        description: "Feature-level review found changed files outside known task scopes.",
        evidence: message,
        recommendation: "Map the files to a task or verify they are generated review artifacts.",
        relatedTaskId: null
      })
    );
  }

  return {
    changedFiles,
    scopeReview: {
      status: errors.length > 0 ? "failed" : warnings.length > 0 ? "warnings" : "passed",
      allowedFiles,
      expectedFiles,
      forbiddenFiles,
      outOfScopeFiles,
      preExistingOutOfScopeFiles,
      forbiddenChangedFiles,
      unmappedChangedFiles,
      warnings,
      errors
    },
    findings
  };
}
