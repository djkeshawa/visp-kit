import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { type ScopeValidationSection } from "../artifacts/schemas/verification.schema.js";
import { normalizeRepositoryPath } from "../core/paths.js";
import { isExemptFromTaskScope } from "../review/diff-summary.js";

/**
 * Declared scope is normalized with the same spelling rule the gate layer uses
 * (`normalizeRepositoryPath`), so a task that writes `./src/a.ts` means the same
 * file here that it means in `task-gate-checks`. Before this, the gate admitted
 * the change and verification then reported it out of scope, and a
 * `./`-prefixed entry in `forbiddenFiles` matched nothing at all.
 *
 * Changed paths stay raw on purpose — see `preserveRawPaths`.
 */
function normalize(values: readonly string[] | undefined): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map(normalizeRepositoryPath)
        .filter((value) => value.length > 0 && value.toUpperCase() !== "TBD")
    )
  ].sort();
}

/**
 * A changed path keeps the exact bytes Git reported. A file literally named
 * `src\notes\sort.ts` on POSIX, or one with a leading space, is a different
 * file from `src/notes/sort.ts`, and normalizing it here would let it pass as
 * the declared one.
 */
function preserveRawPaths(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).filter((value) => value.length > 0))].sort();
}

function implementationFiles(files: readonly string[]): string[] {
  return files.filter((file) => !isExemptFromTaskScope(file));
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
  const changedFiles = implementationFiles(preserveRawPaths(input.changedFiles));
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
  // Gated on the whole declared scope, not on `allowedFiles` alone.
  //
  // `task-gate-checks` already counts `expectedFiles` as declared scope and
  // blocks on it. This asked only whether `allowedFiles` was non-empty, so a
  // task that declared its scope entirely through `expectedFiles` was gated at
  // implement time and then unchecked here — verification downgraded the same
  // out-of-scope change to a warning and reported "warned" rather than
  // "failed". Emptying `allowedFiles` was enough to switch the check off.
  const outOfScopeFiles =
    input.task !== undefined && allowedSet.size > 0
      ? changedFiles.filter((file) => !allowedSet.has(file))
      : [];
  const unmappedChangedFiles =
    input.task === undefined && allowedSet.size > 0
      ? changedFiles.filter((file) => !allowedSet.has(file))
      : [];

  if (input.explicit && input.gitWarnings.length > 0) {
    errors.push(...input.gitWarnings);
  }

  // Only when nothing at all was declared. While this read `allowedFiles`
  // alone it also claimed scope "could not be strictly validated" for tasks
  // whose scope had in fact been validated against `expectedFiles`.
  if (input.task !== undefined && allowedSet.size === 0) {
    warnings.push("Selected task has no declared file scope; scope could not be validated.");
  }

  if (input.task === undefined && allowedSet.size === 0) {
    warnings.push("No task file scope is available; feature-level scope is advisory only.");
  }

  errors.push(
    ...forbiddenChangedFiles.map((file) => `Forbidden file changed: ${file}.`),
    ...outOfScopeFiles.map((file) => `Out-of-scope file changed: ${file}.`)
  );

  if (unmappedChangedFiles.length > 0) {
    warnings.push(`Changed files are not mapped to any task: ${unmappedChangedFiles.join(", ")}.`);
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
