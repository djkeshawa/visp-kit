import { type Task } from "../artifacts/schemas/task.schema.js";
import { type GateBlockedCommand, type GateRuleFinding } from "../artifacts/schemas/gate.schema.js";
import { agentSourceChanges } from "../gates/artifact-presence.js";
import { type ProjectState } from "./project-state.js";
import { type WorkflowAction } from "../integration/workflow-action-schema.js";
import { type AssuranceProfile } from "../artifacts/schemas/evidence.schema.js";
import { type AssurancePhase } from "../oracle/assurance-activation.js";

export type NextStep = {
  readonly success: boolean;
  readonly targetPath: string;
  readonly feature: {
    readonly id: string;
    readonly slug: string;
  } | null;
  readonly task: {
    readonly id: string;
    readonly title: string;
    readonly status: string;
  } | null;
  readonly state: string;
  readonly nextCommand: string;
  readonly reason: string;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly confidence: "high" | "medium" | "low";
  readonly strictnessMode?: string;
  readonly nextAllowedCommand?: string;
  readonly allowed?: boolean;
  readonly blockedCommands?: readonly GateBlockedCommand[];
  readonly failedRules?: readonly GateRuleFinding[];
  readonly implementationAllowed?: boolean;
  readonly prAllowed?: boolean;
  readonly assuranceProfile?: AssuranceProfile;
  /**
   * Where the selected task stands in the oracle/baseline/candidate sequence.
   * `inactive` when the assurance system does not govern this task.
   */
  readonly assurancePhase?: AssurancePhase;
  readonly agentInstruction?: string;
  readonly action?: WorkflowAction;
};

// Phase detection asks a narrower question than scope validation: has the
// agent STARTED implementing? `agentSourceChanges` draws that line — it drops
// `.gitignore` (the toolchain appends to it) and the assurance evidence
// directories (Visp writes those itself when the workflow runs `oracle plan`).
function sourceChanges(state: ProjectState): boolean {
  return agentSourceChanges(state).length > 0;
}

function nextUnfinishedTask(state: ProjectState): Task | undefined {
  return state.taskGraph?.tasks.find(
    (task) => task.status !== "done" && task.status !== "verified"
  );
}

function incompleteChecklist(state: ProjectState): boolean {
  return (
    state.implementationChecklist === undefined ||
    state.implementationChecklist.items.some(
      (item) => item.required && (item.status === "pending" || item.status === "blocked")
    )
  );
}

function usageStatus(state: ProjectState): string {
  return (
    state.actualUsage?.status ??
    state.implementationChecklist?.items.find((item) => item.id === "record-usage")?.status ??
    "not_recorded"
  );
}

function output(input: {
  readonly state: ProjectState;
  readonly nextCommand: string;
  readonly reason: string;
  readonly blockers?: readonly string[];
  readonly warnings?: readonly string[];
  readonly confidence?: "high" | "medium" | "low";
  readonly task?: Task;
  readonly stateName?: string;
}): NextStep {
  const task = input.task ?? input.state.selectedTask;

  return {
    success: (input.blockers ?? []).length === 0,
    targetPath: input.state.targetPath,
    feature:
      input.state.selectedFeature === undefined
        ? null
        : {
            id: input.state.selectedFeature.id,
            slug: input.state.selectedFeature.slug
          },
    task:
      task === undefined
        ? null
        : {
            id: task.id,
            title: task.title,
            status: task.status
          },
    state: input.stateName ?? input.state.status?.currentState ?? "unknown",
    nextCommand: input.nextCommand,
    reason: input.reason,
    blockers: input.blockers ?? [],
    warnings: [...new Set([...input.state.warnings, ...(input.warnings ?? [])])],
    confidence: input.confidence ?? "high"
  };
}

export function recommendNextStep(input: {
  readonly state: ProjectState;
  readonly taskId?: string;
  readonly strict?: boolean;
}): NextStep {
  const state = input.state;

  if (!state.initialized) {
    return output({
      state,
      nextCommand: "visp-kit init",
      reason: "Visp Kit is not initialized.",
      confidence: "high",
      stateName: "not-initialized"
    });
  }

  if (!state.scanned || (input.strict && !state.scanned)) {
    return output({
      state,
      nextCommand: "visp-kit scan",
      reason: "Project scan cache is missing or incomplete.",
      stateName: "scan-needed"
    });
  }

  if (!state.constitution || (input.strict && !state.constitution)) {
    return output({
      state,
      nextCommand: "visp-kit constitution",
      reason: "Compact project constitution is missing.",
      stateName: "constitution-needed"
    });
  }

  if (state.selectedFeature === undefined) {
    return output({
      state,
      nextCommand: 'visp-kit feature "<describe your feature>"',
      reason: "No active feature is selected.",
      stateName: "feature-needed"
    });
  }

  if (!state.artifactSummary.clarifications) {
    return output({
      state,
      nextCommand: "visp-kit clarify",
      reason: "Feature clarifications are missing.",
      stateName: "clarify-needed"
    });
  }

  if (!state.artifactSummary.spec) {
    return output({
      state,
      nextCommand: "visp-kit spec",
      reason: "Feature specification is missing.",
      stateName: "spec-needed"
    });
  }

  if (!state.artifactSummary.plan) {
    return output({
      state,
      nextCommand: "visp-kit plan",
      reason: "Implementation plan is missing.",
      stateName: "plan-needed"
    });
  }

  if (!state.artifactSummary.taskGraph) {
    return output({
      state,
      nextCommand: "visp-kit tasks",
      reason: "Task graph is missing.",
      stateName: "tasks-needed"
    });
  }

  const selectedTask =
    input.taskId === undefined
      ? state.selectedTask
      : state.taskGraph?.tasks.find((task) => task.id === input.taskId);

  if (input.taskId !== undefined && selectedTask === undefined) {
    return output({
      state,
      nextCommand: "visp-kit tasks",
      reason: `Task ${input.taskId} does not exist.`,
      blockers: [`Task not found: ${input.taskId}.`],
      confidence: "high",
      stateName: "task-missing"
    });
  }

  if (selectedTask === undefined) {
    return output({
      state,
      nextCommand: "visp-kit pr",
      reason: "No unfinished task is available.",
      confidence: "medium",
      stateName: "pr-needed"
    });
  }

  if (selectedTask.status === "done" || selectedTask.status === "verified") {
    const nextTask = nextUnfinishedTask(state);

    if (nextTask !== undefined && nextTask.id !== selectedTask.id) {
      return output({
        state,
        task: nextTask,
        nextCommand: `visp-kit context ${nextTask.id}`,
        reason: `${selectedTask.id} is complete enough for now; ${nextTask.id} is the next unfinished task.`,
        stateName: "next-task-needed"
      });
    }
  }

  if (!state.artifactSummary.context) {
    return output({
      state,
      task: selectedTask,
      nextCommand:
        input.taskId === undefined
          ? "visp-kit context --next"
          : `visp-kit context ${selectedTask.id}`,
      reason: `No context pack exists for ${selectedTask.id}.`,
      stateName: "context-needed"
    });
  }

  // The pack exists but its embedded task no longer matches the graph — the
  // task was re-scoped after context generation. Same repair as the gate's
  // answer: regenerate, do not limp forward on a stale pack.
  if (
    state.contextPack !== undefined &&
    state.contextPack.taskId === selectedTask.id &&
    JSON.stringify(state.contextPack.selectedTask) !== JSON.stringify(selectedTask)
  ) {
    return output({
      state,
      task: selectedTask,
      nextCommand: `visp-kit context ${selectedTask.id} --force`,
      reason: `${selectedTask.id} was re-scoped after its context pack was generated; the pack is stale.`,
      stateName: "context-stale"
    });
  }

  if (!sourceChanges(state) && !state.artifactSummary.verification) {
    return output({
      state,
      task: selectedTask,
      nextCommand: "Use .visp/prompts/current-task.prompt.md with your agent",
      reason: `Context exists for ${selectedTask.id}, but no source changes were detected yet.`,
      confidence: "medium",
      stateName: "implementation-needed"
    });
  }

  if (!state.artifactSummary.verification) {
    return output({
      state,
      task: selectedTask,
      nextCommand: `visp-kit verify --task ${selectedTask.id}`,
      reason: `Context exists for ${selectedTask.id} and source changes were detected, but verification is missing.`,
      stateName: "verify-needed"
    });
  }

  if (state.verification?.success === false) {
    return output({
      state,
      task: selectedTask,
      nextCommand: `visp-kit verify --task ${selectedTask.id}`,
      reason: "Latest verification failed.",
      blockers: ["Verification failed."],
      stateName: "verification-failed"
    });
  }

  if (!state.artifactSummary.review) {
    return output({
      state,
      task: selectedTask,
      nextCommand: `visp-kit review --task ${selectedTask.id}`,
      reason: "Verification evidence exists, but review is missing.",
      stateName: "review-needed"
    });
  }

  if (state.review?.result === "failed") {
    return output({
      state,
      task: selectedTask,
      nextCommand: `visp-kit review --task ${selectedTask.id}`,
      reason: "Latest review failed.",
      blockers: ["Review failed."],
      stateName: "review-failed"
    });
  }

  if (!state.artifactSummary.reconcile) {
    return output({
      state,
      task: selectedTask,
      nextCommand: `visp-kit reconcile --task ${selectedTask.id}`,
      reason: "Review evidence exists, but reconciliation is missing.",
      stateName: "reconcile-needed"
    });
  }

  if (state.reconcile?.result === "failed") {
    return output({
      state,
      task: selectedTask,
      nextCommand: `visp-kit verify --task ${selectedTask.id}`,
      reason: "Latest reconciliation failed.",
      blockers: ["Reconciliation failed."],
      stateName: "reconcile-failed"
    });
  }

  if (state.reconcile?.traceabilityUpdate.performed === false) {
    return output({
      state,
      task: selectedTask,
      nextCommand: `visp-kit reconcile --task ${selectedTask.id} --update-traceability`,
      reason: "Reconciliation completed, but traceability has not been updated.",
      stateName: "traceability-update-needed"
    });
  }

  if (incompleteChecklist(state)) {
    return output({
      state,
      task: selectedTask,
      nextCommand:
        state.implementationChecklist === undefined
          ? `visp-kit context ${selectedTask.id}`
          : `visp-kit checklist status --task ${selectedTask.id}`,
      reason: `Required implementation checklist items are incomplete. Usage status: ${usageStatus(state)}.`,
      blockers: [
        "Required implementation checklist items must be done, unavailable, or not applicable before PR."
      ],
      stateName: "checklist-needed"
    });
  }

  const nextTask = nextUnfinishedTask(state);

  if (nextTask !== undefined && nextTask.id !== selectedTask.id) {
    return output({
      state,
      task: nextTask,
      nextCommand: `visp-kit context ${nextTask.id}`,
      reason: `${selectedTask.id} is reconciled; ${nextTask.id} is next.`,
      stateName: "next-task-needed"
    });
  }

  if (!state.artifactSummary.pr || input.strict) {
    return output({
      state,
      task: selectedTask,
      nextCommand: "visp-kit pr",
      reason: "All current task evidence is complete enough for a PR summary.",
      stateName: "pr-needed"
    });
  }

  return output({
    state,
    task: selectedTask,
    nextCommand: "Feature ready for human review/PR.",
    reason: "PR summary exists and no blocking Visp evidence remains.",
    stateName: "ready-for-pr",
    confidence: "medium"
  });
}
