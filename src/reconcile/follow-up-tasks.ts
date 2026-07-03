import {
  type ReconcileChangedFile,
  type ReconcileFinding
} from "../artifacts/schemas/reconcile.schema.js";

export function followUpSuggestions(input: {
  readonly changedFiles: readonly ReconcileChangedFile[];
  readonly findings: readonly ReconcileFinding[];
  readonly taskId?: string | null;
}): readonly string[] {
  const suggestions = new Set<string>();
  const taskSuffix =
    input.taskId === undefined || input.taskId === null ? "" : ` --task ${input.taskId}`;

  for (const file of input.changedFiles.filter((changed) => changed.mappingStatus === "unmapped")) {
    suggestions.add(`Add a follow-up task for unmapped file ${file.path}.`);
    suggestions.add(
      `Update task allowedFiles to include ${file.path} if the change is intentional.`
    );
  }

  if (input.findings.some((finding) => finding.driftType === "verification_missing")) {
    suggestions.add(`Run visp verify${taskSuffix}.`);
  }

  if (input.findings.some((finding) => finding.driftType === "review_missing")) {
    suggestions.add(`Run visp review${taskSuffix}.`);
  }

  if (
    input.findings.some((finding) => finding.driftType === "dependency_change_without_approval")
  ) {
    suggestions.add("Add dependency approval evidence or revert dependency file changes.");
  }

  if (input.changedFiles.length > 12) {
    suggestions.add("Split the task because many files changed.");
  }

  return [...suggestions].sort();
}
