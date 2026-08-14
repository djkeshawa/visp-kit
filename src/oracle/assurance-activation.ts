import { type PolicyArtifact } from "../artifacts/schemas/policy.schema.js";

/**
 * Where a task stands in the assurance sequence.
 *
 * `plan` → `approve` (critical tasks only) → `lock` → `baseline` → `authorized`,
 * then `candidate` once code has been written and back to `authorized` once the
 * comparison passes. Each phase names exactly one command, because `next` must
 * hand back something a loop can run, not a paragraph describing what to run.
 */
export type AssurancePhase =
  | "inactive"
  | "plan"
  | "approve"
  | "lock"
  | "baseline"
  | "authorized"
  | "candidate";

export const assurancePhases: readonly AssurancePhase[] = [
  "inactive",
  "plan",
  "approve",
  "lock",
  "baseline",
  "authorized",
  "candidate"
];

export type AssuranceNextStep = {
  readonly active: boolean;
  readonly phase: AssurancePhase;
  /** The single command that advances the sequence; absent when nothing is owed. */
  readonly nextCommand?: string;
  readonly reason: string;
};

/**
 * Whether the oracle / baseline / candidate evidence system governs this task.
 *
 * Three independent triggers, in the order a reader will meet them:
 *
 *  1. VSP023 is enabled in policy. On by default in `locked` only; any project
 *     may set it at any strictness.
 *  2. The project declares an `assurance.profile`. Asking for an assurance
 *     profile is asking for assurance.
 *  3. An oracle plan already exists for the task. Once a plan is on disk the
 *     gate is live whatever policy says, so deleting the policy rule cannot
 *     open a gate a plan has already closed.
 *
 * The predicate lived in three places — the implement gate, `done`, and now
 * `next` — and a fourth copy is how the three drift apart.
 */
export function assuranceActive(input: {
  readonly policy: PolicyArtifact;
  readonly oraclePlanExists: boolean;
}): boolean {
  return (
    input.policy.rules.requireOracleLockBeforeImplementation === true ||
    input.policy.assurance !== undefined ||
    input.oraclePlanExists
  );
}
