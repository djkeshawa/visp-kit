import { type ProjectState } from "../orchestrator/project-state.js";
import { type NextStep } from "../orchestrator/next-step.js";

function yes(value: boolean): string {
  return value ? "yes" : "no";
}

function evidence(state: ProjectState): string {
  return [
    `Context: ${state.artifactSummary.context ? `${state.selectedTask?.id ?? "feature"} ready` : "missing"}`,
    `Verification: ${state.verification === undefined ? "missing" : state.verification.success ? "passed" : "failed"}`,
    `Review: ${state.review === undefined ? "missing" : state.review.result}`,
    `Reconcile: ${state.reconcile === undefined ? "missing" : state.reconcile.result}`,
    `PR: ${state.artifactSummary.pr ? "ready" : "missing"}`
  ].map((line) => `  ${line}`).join("\n");
}

export function renderStatusMarkdown(input: {
  readonly state: ProjectState;
  readonly next: NextStep;
  readonly verbose?: boolean;
  readonly policyStatus?: "valid" | "missing" | "invalid";
  readonly strictnessMode?: string;
  readonly latestGate?: string;
  readonly blockedCommands?: readonly { readonly command: string; readonly reason: string; readonly ruleId: string }[];
}): string {
  const state = input.state;
  const projectName = state.profile?.name ?? state.config?.projectId ?? "unknown";
  const feature = state.selectedFeature === undefined
    ? "none"
    : `${state.selectedFeature.id}-${state.selectedFeature.slug}`;
  const activeTask = state.selectedTask === undefined
    ? "none"
    : `${state.selectedTask.id} - ${state.selectedTask.title}`;
  const artifacts = Object.entries(state.artifactSummary)
    .map(([name, present]) => `- ${name}: ${yes(present)}`)
    .join("\n");
  const warnings = state.warnings.length === 0
    ? "- None."
    : state.warnings.map((warning) => `- ${warning}`).join("\n");

  return `# Visp Status

Project: ${projectName}
Preset: ${state.config?.preset ?? "unknown"}
Budget: ${state.config?.budgetMode ?? "unknown"}
Package manager: ${state.profile?.packageManager ?? "unknown"}

## State

- Initialized: ${yes(state.initialized)}
- Scanned: ${yes(state.scanned)}
- Constitution: ${yes(state.constitution)}
- Workflow state: ${state.status?.currentState ?? "unknown"}

## Policy

- Strictness: ${input.strictnessMode ?? input.next.strictnessMode ?? "unknown"}
- Policy: ${input.policyStatus ?? "unknown"}
- Latest gate: ${input.latestGate ?? "unknown"}
- Next allowed command: ${input.next.nextAllowedCommand ?? input.next.nextCommand}
- Implementation allowed: ${input.next.implementationAllowed ? "yes" : "no"}
- PR allowed: ${input.next.prAllowed ? "yes" : "no"}

Blocked commands:
${(input.blockedCommands ?? input.next.blockedCommands ?? []).length === 0 ? "- None." : (input.blockedCommands ?? input.next.blockedCommands ?? []).map((blocked) => `- ${blocked.command}: ${blocked.reason} (${blocked.ruleId})`).join("\n")}

## Active Feature

${feature}

## Active Task

${activeTask}

## Tasks

- Total: ${state.taskSummary.total}
- Ready: ${state.taskSummary.ready}
- Pending: ${state.taskSummary.pending}
- In progress: ${state.taskSummary.inProgress}
- Blocked: ${state.taskSummary.blocked}
- Done: ${state.taskSummary.done}
- Verified: ${state.taskSummary.verified}

## Latest Evidence

${evidence(state)}

${input.verbose ? `## Artifacts\n\n${artifacts}\n\n## Git\n\n- Repository: ${yes(state.git.isRepo)}\n- Branch: ${state.git.branch ?? "unknown"}\n- Staged changes: ${state.git.stagedCount}\n- Unstaged changes: ${state.git.unstagedCount}\n\n` : ""}## Warnings

${warnings}

## Next

${input.next.nextCommand}

Reason: ${input.next.reason}
`;
}
