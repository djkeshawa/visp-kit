import { type Task } from "../artifacts/schemas/task.schema.js";
import { type ProjectState } from "../orchestrator/project-state.js";
import { changedDependencyFiles, sourceChangedFiles } from "./artifact-presence.js";
import { type GateCheck } from "./gate-result.js";

const behaviorKeywords =
  /\b(add|update|create|delete|validate|calculate|permission|api|persistence|state|workflow)\b/i;

export function isBehaviorTask(task: Task): boolean {
  return task.riskLevel !== "low" || behaviorKeywords.test(`${task.title} ${task.description}`);
}

export function taskScopeChecks(state: ProjectState): readonly GateCheck[] {
  const task = state.selectedTask;

  if (task === undefined) return [];

  const changed = sourceChangedFiles(state);
  const forbidden = new Set(task.forbiddenFiles ?? []);
  const expected = new Set(task.expectedFiles ?? []);
  const allowed = new Set(task.allowedFiles);
  const forbiddenChanged = changed.filter((file) => forbidden.has(file));
  const outOfScope =
    allowed.size === 0
      ? []
      : changed.filter((file) => !allowed.has(file) && !expected.has(file) && !forbidden.has(file));
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

  if (outOfScope.length > 0) {
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
      evidence: allowed.size === 0 ? "Task has no allowedFiles." : "No out-of-scope files detected."
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
