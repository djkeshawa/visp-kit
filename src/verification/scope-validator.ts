import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { type ScopeValidationSection } from "../artifacts/schemas/verification.schema.js";

function normalize(values: readonly string[] | undefined): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => value.replaceAll("\\", "/").trim())
        .filter((value) => value.length > 0 && value.toUpperCase() !== "TBD")
    )
  ].sort();
}

function implementationFiles(files: readonly string[]): readonly string[] {
  return files.filter((file) => !file.startsWith(".visp/"));
}

export function validateScope(input: {
  readonly changedFiles: readonly string[];
  readonly task?: Task;
  readonly taskGraph?: TaskGraphArtifact;
  readonly explicit: boolean;
  readonly gitWarnings: readonly string[];
}): ScopeValidationSection {
  const warnings = [...input.gitWarnings];
  const errors: string[] = [];
  const changedFiles = implementationFiles(normalize(input.changedFiles));
  const allowedFiles = normalize(
    input.task === undefined
      ? input.taskGraph?.tasks.flatMap((task) => task.allowedFiles)
      : input.task.allowedFiles
  );
  const expectedFiles = normalize(
    input.task === undefined
      ? input.taskGraph?.tasks.flatMap((task) => task.expectedFiles ?? [])
      : input.task.expectedFiles
  );
  const forbiddenFiles = normalize(
    input.task === undefined
      ? input.taskGraph?.tasks.flatMap((task) => task.forbiddenFiles ?? [])
      : input.task.forbiddenFiles
  );
  const allowedSet = new Set([...allowedFiles, ...expectedFiles]);
  const forbiddenSet = new Set(forbiddenFiles);
  const forbiddenChangedFiles = changedFiles.filter((file) => forbiddenSet.has(file));
  const outOfScopeFiles =
    input.task !== undefined && allowedFiles.length > 0
      ? changedFiles.filter((file) => !allowedSet.has(file))
      : [];
  const unmappedChangedFiles =
    input.task === undefined && allowedSet.size > 0
      ? changedFiles.filter((file) => !allowedSet.has(file))
      : [];

  if (input.explicit && input.gitWarnings.length > 0) {
    errors.push(...input.gitWarnings);
  }

  if (input.task !== undefined && allowedFiles.length === 0) {
    warnings.push("Selected task has no allowedFiles; scope could not be strictly validated.");
  }

  if (input.task === undefined && allowedSet.size === 0) {
    warnings.push("No task file scope is available; feature-level scope is advisory only.");
  }

  errors.push(
    ...forbiddenChangedFiles.map((file) => `Forbidden file changed: ${file}.`),
    ...outOfScopeFiles.map((file) => `Out-of-scope file changed: ${file}.`)
  );

  if (unmappedChangedFiles.length > 0) {
    warnings.push(
      `Changed files are not mapped to any task: ${unmappedChangedFiles.join(", ")}.`
    );
  }

  return {
    status: errors.length > 0 ? "failed" : warnings.length > 0 ? "warned" : "passed",
    changedFiles,
    allowedFiles,
    expectedFiles,
    forbiddenFiles,
    outOfScopeFiles,
    forbiddenChangedFiles,
    unmappedChangedFiles,
    warnings,
    errors
  };
}
