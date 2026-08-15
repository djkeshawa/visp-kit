import { type Task } from "../artifacts/schemas/task.schema.js";
import { normalizeRepositoryPath } from "../core/paths.js";
import { type ProjectState } from "../orchestrator/project-state.js";
import { changedDependencyFiles, sourceChangedFiles } from "./artifact-presence.js";
import { type GateCheck } from "./gate-result.js";

const behaviorKeywords =
  /\b(add|update|create|delete|validate|calculate|permission|api|persistence|state|workflow)\b/i;

export function isBehaviorTask(task: Task): boolean {
  return task.riskLevel !== "low" || behaviorKeywords.test(`${task.title} ${task.description}`);
}

/**
 * Does this scope entry name a file, or is it prose?
 *
 * The distinction has to be made because the task generator writes
 * `forbiddenFiles: ["Dependency manifests and lockfiles unless dependency
 * approval is part of this task"]` — a rule, not a path — and counting that as
 * a declared scope would classify from a sentence.
 *
 * The old test was "contains no space", which also removed `src/my file.ts`
 * from the declared surface entirely and silently, taking M2 and both linkage
 * rules with it. That is the same shape as the defect recorded forty lines
 * below — the way to escape a check was to remove what the check reads — except
 * performed by the parser rather than by an agent. A file whose name has a
 * space in it is still a file.
 *
 * So a spaced entry is admitted when it looks like a path rather than a
 * sentence: it must contain a directory separator AND end in a short file
 * extension. The template's prose rule has neither. The residual case is prose
 * that both contains a slash and ends in an extension ("Do not touch
 * src/index.ts"); that reads as a declared path, which turns VSP012 on rather
 * than off, so the remaining error is in the blocking direction.
 */
function namesAFile(value: string): boolean {
  if (value.length === 0) return false;
  if (!/\s/u.test(value)) return true;

  return value.includes("/") && /\.[A-Za-z0-9]{1,8}$/u.test(value);
}

/**
 * Scope entries that actually name a file, in ONE spelling.
 *
 * Normalisation happens here because this is the boundary every declared path
 * crosses on its way to a join: `declaredSurface` builds the change surface
 * from it, and the surface is then compared, by exact string, against scan's
 * file index, against the module map and against intel's resolved paths. Scan
 * writes `src/a.ts`; a task may write `./src/a.ts` or `src\a.ts`, and under
 * either of those every one of those joins silently matched nothing — which
 * does not read as a wrong answer, it reads as "this task has no linkage", and
 * a task with no linkage is a task with no gate.
 */
export function concreteScopePaths(paths: readonly string[]): readonly string[] {
  return paths
    .map((value) => normalizeRepositoryPath(value))
    .filter((value) => value.toUpperCase() !== "TBD" && namesAFile(value));
}

export function taskScopeChecks(state: ProjectState): readonly GateCheck[] {
  const task = state.selectedTask;

  if (task === undefined) return [];

  // Same spelling on both sides of every membership test below.
  const changed = sourceChangedFiles(state).map(normalizeRepositoryPath);
  const forbidden = new Set((task.forbiddenFiles ?? []).map(normalizeRepositoryPath));
  const expected = new Set((task.expectedFiles ?? []).map(normalizeRepositoryPath));
  const allowed = new Set(task.allowedFiles.map(normalizeRepositoryPath));
  const forbiddenChanged = changed.filter((file) => forbidden.has(file));

  // An empty scope is not a permissive scope — it is an ABSENT one, and the
  // two were treated identically. Out-of-scope blocking switched itself off,
  // and VSP012 then reported "Changed files are inside task scope" with the
  // evidence "Task has no allowedFiles."
  //
  // The consequence: the way to get permission for an edit the gate had just
  // blocked was to delete the list that blocked it. Removing a constraint
  // removed the check, and the report called that a pass. The product's
  // headline promise is that an exact allowed-file list is declared before any
  // edit; this made the list optional in the only place it is enforced.
  //
  // Placeholder entries count as undeclared for the same reason. `["TBD"]`
  // did block real edits, but told the reader their file was out of scope
  // when the truth is that nobody has written the scope yet — a different
  // problem with a different repair.
  const declaredScope = new Set([
    ...concreteScopePaths([...allowed]),
    ...concreteScopePaths([...expected])
  ]);
  const scopeUndeclared = declaredScope.size === 0;
  const outOfScope = scopeUndeclared
    ? []
    : changed.filter((file) => !declaredScope.has(file) && !forbidden.has(file));
  // Normalized like every other membership test above. `changedDependencyFiles`
  // returns raw paths, so this one test was comparing raw against normalized —
  // the single exception to the rule the comment on `changed` states.
  const dependencyChanged = changedDependencyFiles(state).map(normalizeRepositoryPath);
  const dependencyApproved = dependencyChanged.every(
    (file) => allowed.has(file) || expected.has(file)
  );
  const checks: GateCheck[] = [];

  if (forbiddenChanged.length > 0) {
    checks.push({
      ruleId: "VSP011",
      passed: false,
      severity: "error",
      message: "Forbidden files changed.",
      recommendation: "Revert forbidden file changes or update the task scope.",
      evidence: forbiddenChanged.join(", ")
    });
  } else {
    checks.push({
      ruleId: "VSP011",
      passed: true,
      message: "No forbidden file changes detected.",
      recommendation: "Continue.",
      evidence: "Changed files do not match forbiddenFiles."
    });
  }

  if (scopeUndeclared && changed.length > 0) {
    checks.push({
      ruleId: "VSP012",
      passed: false,
      severity: "error",
      message: "Task changed files without declaring a file scope.",
      recommendation: `Set allowedFiles on task ${task.id} in the task graph, then re-run this gate.`,
      evidence:
        `Task ${task.id} declares no allowed or expected file paths, so no change can be shown to be in scope. ` +
        `Changed: ${changed.join(", ")}.`
    });
  } else if (outOfScope.length > 0) {
    checks.push({
      ruleId: "VSP012",
      passed: false,
      severity: "error",
      message: "Out-of-scope files changed.",
      recommendation: "Move unrelated changes to another task or update allowedFiles.",
      evidence: outOfScope.join(", ")
    });
  } else {
    checks.push({
      ruleId: "VSP012",
      passed: true,
      message: "Changed files are inside task scope.",
      recommendation: "Continue.",
      // Only reachable with an undeclared scope when nothing changed at all,
      // which is a genuine pass: there is no work to judge yet.
      evidence: scopeUndeclared
        ? "No source files have changed under this task."
        : "No out-of-scope files detected."
    });
  }

  if (dependencyChanged.length > 0 && !dependencyApproved) {
    checks.push({
      ruleId: "VSP013",
      passed: false,
      severity: "error",
      message: "Dependency files changed without task approval.",
      recommendation: "Revert dependency changes or add explicit task scope approval.",
      evidence: dependencyChanged.join(", ")
    });
  } else {
    checks.push({
      ruleId: "VSP013",
      passed: true,
      message: "No unapproved dependency changes detected.",
      recommendation: "Continue.",
      evidence:
        dependencyChanged.length === 0
          ? "No dependency files changed."
          : "Dependency files are in task allowedFiles or expectedFiles."
    });
  }

  return checks;
}
