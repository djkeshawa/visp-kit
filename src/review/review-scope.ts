import { isExemptFromTaskScope } from "./diff-summary.js";
import { type ReviewChangedFile } from "../artifacts/schemas/review.schema.js";
import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { type LoadedDiffFile } from "./diff-loader.js";
import { normalizeDeclaredPathList as normalizeList } from "./diff-summary.js";
import { finding, type ReviewFindingDraft } from "./review-findings.js";

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
    readonly reviewedExpectedFiles: readonly string[];
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
  // Same exemption as the verify path: Kit's own artifacts are not the
  // user's feature work, and blaming a task for them is a guaranteed false
  // finding on every task in every project.
  const implementationFiles = changedFiles.filter(
    (file) => !file.isGeneratedVispFile && !isExemptFromTaskScope(file.path)
  );
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
  // Matched against every changed file rather than the in-scope subset: an
  // expected file is an explicit declaration by the task, so if the task
  // declared it and it changed, the review saw it — even for a path the scope
  // filter exempts.
  const expectedSet = new Set(expectedFiles);
  const reviewedExpectedFiles = changedFiles
    .filter((file) => !file.isGeneratedVispFile && expectedSet.has(file.path))
    .map((file) => file.path);

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

  // `expectedFiles` are the task's declared deliverables, but until LC-130 they
  // only ever widened the allowed set — nothing checked that the review saw
  // any of them. A one-comment edit to an allowed file passed review, and
  // `done` wrote a durable `verified` on it while both expected files sat
  // untouched. A review that saw none of the declared work has not judged the
  // task, whatever else it looked at.
  if (input.task !== undefined && expectedFiles.length > 0 && reviewedExpectedFiles.length === 0) {
    const message =
      `No expected file for ${input.task.id} appears in this review: ` +
      `${expectedFiles.join(", ")}. Examined ${changedFiles.length} changed file(s).`;
    errors.push(message);
    findings.push(
      finding({
        category: "scope",
        severity: "error",
        title: "Task's expected files were not reviewed",
        description:
          "The task declares expected files and this review saw none of them change, so it has judged none of the declared work.",
        evidence: message,
        recommendation:
          "Implement the expected files, or if the work is already committed re-run with `--base <git-ref>` so the review covers it.",
        relatedTaskId: input.task.id,
        relatedRequirementIds: input.task.requirementIds,
        relatedAcceptanceCriterionIds: input.task.acceptanceCriterionIds
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
      reviewedExpectedFiles,
      forbiddenChangedFiles,
      unmappedChangedFiles,
      warnings,
      errors
    },
    findings
  };
}
