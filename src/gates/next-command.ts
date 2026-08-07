import {
  clarificationsReadiness,
  planReadiness,
  specReadiness,
  taskGraphReadiness
} from "./artifact-readiness.js";
import { sourceChangedFiles } from "./artifact-presence.js";
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
  // Advance on readiness, not on existence.
  //
  // These lines used to ask `artifactSummary.<name>`, which is `exists()`. So
  // the moment `visp-kit spec` wrote its all-TBD draft, the guidance moved on
  // to "visp-kit plan" — a command that then refuses the very file that caused
  // the advance. Fixing only the gate checks would have left this half of the
  // product still pointing past the blocker: same contradiction, new location.
  //
  // An artifact that exists but is not yet usable sends the reader back to the
  // command that owns it in `--validate` form, which prints exactly what is
  // still missing rather than refusing to overwrite their work.
  const clarifications = clarificationsReadiness(state);
  if (clarifications.state === "missing") return "visp-kit clarify";
  if (clarifications.state === "incomplete") return "visp-kit clarify --validate";

  const spec = specReadiness(state);
  if (spec.state === "missing") return "visp-kit spec";
  if (spec.state === "incomplete") return "visp-kit spec --validate";

  const plan = planReadiness(state);
  if (plan.state === "missing") return "visp-kit plan";
  if (plan.state === "incomplete") return "visp-kit plan --validate";

  const taskGraph = taskGraphReadiness(state);
  if (taskGraph.state === "missing") return "visp-kit tasks";
  if (taskGraph.state === "incomplete") return "visp-kit tasks --validate";

  if (!state.artifactSummary.context) return "visp-kit context --next";
  if (taskId === undefined) return "visp-kit context --next";

  // Same rule as the orchestrator's phase detection: the toolchain's own
  // setup files and a lone .gitignore edit are not the agent's implementation.
  const sourceChanged = sourceChangedFiles(state).some((file) => file !== ".gitignore");

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
  // Terminal state, stated as one. Without it the answer stayed "visp-kit pr"
  // forever after pr.md existed, and status/next/handoff pointed at each other
  // with no way to be done.
  if (state.artifactSummary.pr) {
    return 'Feature complete — pr.md is ready for review. Start the next feature with visp-kit feature "<describe your feature>"';
  }
  return "visp-kit pr";
}
