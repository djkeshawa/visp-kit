import { type GateContext } from "./gate-context.js";

function taskFlag(taskId: string | undefined): string {
  return taskId === undefined ? "" : ` --task ${taskId}`;
}

export function nextAllowedCommand(context: GateContext): string {
  const state = context.state;
  const rules = context.policy.policy.rules;
  const taskId = state.selectedTask?.id;

  if (!state.initialized) return "visp-kit init";
  if (!context.policy.policyExists) return "visp-kit policy init --strictness strict";
  if (rules.requireScanBeforeFeature && !state.scanned) return "visp-kit scan";
  if (rules.requireConstitutionBeforeFeature && !state.constitution) {
    return "visp-kit constitution";
  }
  if (state.selectedFeature === undefined) {
    return 'visp-kit feature "<describe your feature>"';
  }
  if (!state.artifactSummary.clarifications) return "visp-kit clarify";
  if (!state.artifactSummary.spec) return "visp-kit spec";
  if (!state.artifactSummary.plan) return "visp-kit plan";
  if (!state.artifactSummary.taskGraph) return "visp-kit tasks";
  if (!state.artifactSummary.context) return "visp-kit context --next";
  if (taskId === undefined) return "visp-kit context --next";

  const sourceChanged = state.git.changedFiles.some((file) => !file.startsWith(".visp/"));

  if (!sourceChanged && !state.artifactSummary.verification) {
    return "Use .visp/prompts/current-task.prompt.md with your agent";
  }
  if (!state.artifactSummary.verification || state.verification?.success === false) {
    return `visp-kit verify${taskFlag(taskId)}`;
  }
  if (!state.artifactSummary.review || state.review?.result === "failed") {
    return `visp-kit review${taskFlag(taskId)}`;
  }
  if (!state.artifactSummary.reconcile || state.reconcile?.result === "failed") {
    return `visp-kit reconcile${taskFlag(taskId)} --update-traceability`;
  }
  if (state.reconcile?.traceabilityUpdate.performed === false) {
    return `visp-kit reconcile${taskFlag(taskId)} --update-traceability`;
  }
  if (state.implementationChecklist === undefined) {
    return `visp-kit context ${taskId}`;
  }

  const incompleteChecklist = state.implementationChecklist.items.some(
    (item) => item.required && (item.status === "pending" || item.status === "blocked")
  );

  if (incompleteChecklist) {
    return `visp-kit checklist status --task ${taskId}`;
  }

  const nextTask = state.taskGraph?.tasks.find(
    (task) => task.status !== "done" && task.status !== "verified" && task.id !== taskId
  );

  if (nextTask !== undefined) return `visp-kit context ${nextTask.id}`;
  return "visp-kit pr";
}
