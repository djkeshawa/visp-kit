import { type GateContext } from "./gate-context.js";

function taskFlag(taskId: string | undefined): string {
  return taskId === undefined ? "" : ` --task ${taskId}`;
}

export function nextAllowedCommand(context: GateContext): string {
  const state = context.state;
  const rules = context.policy.policy.rules;
  const taskId = state.selectedTask?.id;

  if (!state.initialized) return "visp init";
  if (!context.policy.policyExists) return "visp policy init --strictness strict";
  if (rules.requireScanBeforeFeature && !state.scanned) return "visp scan";
  if (rules.requireConstitutionBeforeFeature && !state.constitution) {
    return "visp constitution";
  }
  if (state.selectedFeature === undefined) {
    return 'visp feature "<describe your feature>"';
  }
  if (!state.artifactSummary.clarifications) return "visp clarify";
  if (!state.artifactSummary.spec) return "visp spec";
  if (!state.artifactSummary.plan) return "visp plan";
  if (!state.artifactSummary.taskGraph) return "visp tasks";
  if (!state.artifactSummary.context) return "visp context --next";
  if (taskId === undefined) return "visp context --next";

  const sourceChanged = state.git.changedFiles.some((file) => !file.startsWith(".visp/"));

  if (!sourceChanged && !state.artifactSummary.verification) {
    return "Use .visp/prompts/current-task.prompt.md with your agent";
  }
  if (!state.artifactSummary.verification || state.verification?.success === false) {
    return `visp verify${taskFlag(taskId)}`;
  }
  if (!state.artifactSummary.review || state.review?.result === "failed") {
    return `visp review${taskFlag(taskId)}`;
  }
  if (!state.artifactSummary.reconcile || state.reconcile?.result === "failed") {
    return `visp reconcile${taskFlag(taskId)} --update-traceability`;
  }
  if (state.reconcile?.traceabilityUpdate.performed === false) {
    return `visp reconcile${taskFlag(taskId)} --update-traceability`;
  }
  if (state.implementationChecklist === undefined) {
    return `visp context ${taskId}`;
  }

  const incompleteChecklist = state.implementationChecklist.items.some((item) =>
    item.required && (item.status === "pending" || item.status === "blocked")
  );

  if (incompleteChecklist) {
    return `visp checklist status --task ${taskId}`;
  }

  const nextTask = state.taskGraph?.tasks.find((task) =>
    task.status !== "done" && task.status !== "verified" && task.id !== taskId
  );

  if (nextTask !== undefined) return `visp context ${nextTask.id}`;
  return "visp pr";
}
