import {
  type ApprovalClass,
  type BlastRadius,
  type Reversibility,
  type RiskLevel
} from "../artifacts/schemas/common.schema.js";

/**
 * What a host must do before acting on a task (P8-05).
 *
 * Risk level already said how likely a mistake was and how much it would cost.
 * It never said whether the change could be taken back, and that is the question
 * both Phase 8 research reports build their autonomy model on: a high-risk edit
 * on a branch and a high-risk deletion of production data were previously
 * indistinguishable to this system.
 *
 * **Kit derives, Hyper enforces.** Hyper must never compute this itself —
 * doing so would make it a second authority on permission, which the workspace
 * boundary forbids. It reads the declared value and obeys it.
 *
 * **Confidence is not an input.** No calibration figure, routing estimate, or
 * model score appears in this function's signature, and none may be added.
 * Being sure about an action is not the same as being allowed to take it; that
 * distinction is the invariant Phase 8 is most likely to erode by accident.
 */

/** An absent declaration is treated as the most dangerous case, not the safest. */
export const DEFAULT_REVERSIBILITY: Reversibility = "irreversible";
export const DEFAULT_BLAST_RADIUS: BlastRadius = "external";

export type ApprovalInput = {
  readonly reversibility?: Reversibility;
  readonly blastRadius?: BlastRadius;
  readonly riskLevel?: RiskLevel;
};

/**
 * Derive the approval class.
 *
 * The rule, in order of strength:
 *
 * 1. Anything that cannot be undone, or that reaches outside this repository,
 *    needs a human. Those are the two cases where being wrong cannot be walked
 *    back by the agent that caused it.
 * 2. Anything only compensable, or high risk, runs but must checkpoint first so
 *    there is a known-good state to return to.
 * 3. Everything else — reversible, confined to the task, not high risk — is
 *    autonomous.
 *
 * An omitted field is read as its conservative default. Silence is not consent:
 * a task graph that forgot to declare reversibility gets the treatment of one
 * that declared the worst case, so forgetting cannot buy autonomy.
 */
export function deriveApprovalClass(input: ApprovalInput): ApprovalClass {
  const reversibility = input.reversibility ?? DEFAULT_REVERSIBILITY;
  const blastRadius = input.blastRadius ?? DEFAULT_BLAST_RADIUS;

  if (reversibility === "irreversible" || blastRadius === "external") {
    return "approval_required";
  }
  if (reversibility === "compensable" || input.riskLevel === "high") {
    return "checkpointed";
  }
  return "autonomous";
}

/**
 * Whether a declared class matches what the declared inputs imply.
 *
 * Kit writes both onto the task, so the two can drift — a hand-edited graph, or
 * a stale artifact regenerated from newer fields. A declaration weaker than its
 * inputs justify is the dangerous direction and is reported; a declaration
 * stricter than required is the author choosing caution and is left alone.
 */
const STRENGTH: Record<ApprovalClass, number> = {
  autonomous: 0,
  checkpointed: 1,
  approval_required: 2
};

export function approvalClassIsUnderstated(declared: ApprovalClass, input: ApprovalInput): boolean {
  return STRENGTH[declared] < STRENGTH[deriveApprovalClass(input)];
}
