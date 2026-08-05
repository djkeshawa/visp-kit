import { type Task } from "../artifacts/schemas/task.schema.js";
import { type ProjectState } from "../orchestrator/project-state.js";
import { changedDependencyFiles, sourceChangedFiles } from "./artifact-presence.js";
import { type GateCheck } from "./gate-result.js";

const behaviorKeywords =
  /\b(add|update|create|delete|validate|calculate|permission|api|persistence|state|workflow)\b/i;

export function isBehaviorTask(task: Task): boolean {
  return task.riskLevel !== "low" || behaviorKeywords.test(`${task.title} ${task.description}`);
}

/**
 * Scope entries that actually name a file.
 *
 * The task generator writes `allowedFiles: ["TBD"]`, and forbiddenFiles
 * defaults to a prose rule rather than a path. Neither says anything about
 * which files may change, so neither counts as a declared scope.
 */
export function concreteScopePaths(paths: readonly string[]): readonly string[] {
  return paths.filter((value) => {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.toUpperCase() !== "TBD" && !trimmed.includes(" ");
  });
}

export function taskScopeChecks(state: ProjectState): readonly GateCheck[] {
  const task = state.selectedTask;

  if (task === undefined) return [];

  const changed = sourceChangedFiles(state);
  const forbidden = new Set(task.forbiddenFiles ?? []);
  const expected = new Set(task.expectedFiles ?? []);
  const allowed = new Set(task.allowedFiles);
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
  const dependencyChanged = changedDependencyFiles(state);
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
