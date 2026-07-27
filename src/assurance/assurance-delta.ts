import { type ReviewDecision } from "../artifacts/schemas/review-decision.schema.js";

/**
 * What changed since the last state a human actually trusted.
 *
 * A reviewer returning to a change does not want the whole assurance case
 * again. They want the much smaller question answered: *is what I already
 * approved still true, and if not, what moved?* Re-reading a full case to find
 * that out is the work the case was supposed to remove.
 *
 * The trusted state is a recorded review decision. It already binds the code
 * revisions, a state hash, the policy hash, and every freshness input, so the
 * delta is computable from artifacts Kit writes today — nothing new has to be
 * captured at decision time for this to work retrospectively.
 */

/** One thing that moved between the trusted decision and now. */
export type AssuranceDeltaChange = {
  /** Machine-readable category, stable across releases. */
  readonly kind: "code" | "policy" | "freshness_input" | "evidence_availability";
  /** What moved, in the reviewer's vocabulary rather than the schema's. */
  readonly label: string;
  readonly trusted: string;
  readonly current: string;
  /**
   * Whether this alone means the earlier decision no longer covers the current
   * state. A changed policy or code state does; an input that merely became
   * *available* does not, because more evidence than was approved against is
   * not a reason to distrust the approval.
   */
  readonly invalidatesDecision: boolean;
};

export type AssuranceDelta = {
  readonly trustedDecisionHash: string;
  readonly trustedDecidedAt: string;
  readonly changes: readonly AssuranceDeltaChange[];
  /**
   * True when nothing that the decision depended on has moved. The reviewer can
   * stop reading here.
   */
  readonly unchanged: boolean;
  /** True when at least one change invalidates the earlier decision. */
  readonly decisionStale: boolean;
  /** One sentence, because this is the line a returning reviewer reads first. */
  readonly summary: string;
};

/** The current state, shaped like the parts of a decision that can move. */
export type AssuranceDeltaState = {
  readonly codeState: ReviewDecision["codeState"];
  readonly policy: ReviewDecision["policy"];
  readonly freshnessInputs: ReviewDecision["freshnessInputs"];
};

function freshnessFingerprint(input: ReviewDecision["freshnessInputs"][number]): string {
  return input.status === "available" ? input.sha256 : input.status;
}

/**
 * Walks a decision chain to the most recent decision, following supersession.
 *
 * A superseded decision is not the trusted state — it is a decision someone
 * already replaced. Comparing against it would report a change the reviewer
 * has in fact already seen and accepted.
 */
export function latestDecision(decisions: readonly ReviewDecision[]): ReviewDecision | undefined {
  if (decisions.length === 0) return undefined;

  const superseded = new Set(
    decisions
      .map((decision) => decision.supersedesDecisionHash)
      .filter((hash): hash is string => hash !== null && hash !== undefined)
  );
  const live = decisions.filter((decision) => !superseded.has(decision.decisionHash));

  // Ties are broken by decision time so the result is deterministic even if a
  // chain has been forked by hand.
  return [...live].sort((left, right) => right.decidedAt.localeCompare(left.decidedAt))[0];
}

export function computeAssuranceDelta(input: {
  readonly trusted: ReviewDecision;
  readonly current: AssuranceDeltaState;
}): AssuranceDelta {
  const changes: AssuranceDeltaChange[] = [];
  const { trusted, current } = input;

  if (trusted.codeState.targetRevision !== current.codeState.targetRevision) {
    changes.push({
      kind: "code",
      label: "the code under review",
      trusted: trusted.codeState.targetRevision,
      current: current.codeState.targetRevision,
      invalidatesDecision: true
    });
  }

  // The reviewed diff itself. This is the hash that moves when a file is
  // edited without committing, so it catches the case a revision comparison
  // alone would miss.
  if (trusted.codeState.snapshotSha256 !== current.codeState.snapshotSha256) {
    changes.push({
      kind: "code",
      label: "the reviewed diff",
      trusted: trusted.codeState.snapshotSha256,
      current: current.codeState.snapshotSha256,
      invalidatesDecision: true
    });
  }

  // The state hash can move while the revision does not, because a workspace
  // comparison includes uncommitted work. Reporting it separately keeps
  // "someone committed" distinct from "someone edited without committing".
  if (trusted.codeState.stateSha256 !== current.codeState.stateSha256) {
    changes.push({
      kind: "code",
      label: "the working state of the reviewed files",
      trusted: trusted.codeState.stateSha256,
      current: current.codeState.stateSha256,
      invalidatesDecision: true
    });
  }

  if (trusted.policy.sha256 !== current.policy.sha256) {
    changes.push({
      kind: "policy",
      label: "the policy the decision was made under",
      trusted: trusted.policy.sha256,
      current: current.policy.sha256,
      invalidatesDecision: true
    });
  }

  const trustedInputs = new Map(trusted.freshnessInputs.map((entry) => [entry.label, entry]));
  const currentInputs = new Map(current.freshnessInputs.map((entry) => [entry.label, entry]));

  for (const [label, trustedInput] of trustedInputs) {
    const currentInput = currentInputs.get(label);

    if (currentInput === undefined) {
      changes.push({
        kind: "evidence_availability",
        label: `${label} is no longer present`,
        trusted: trustedInput.status,
        current: "absent",
        invalidatesDecision: true
      });
      continue;
    }

    const before = freshnessFingerprint(trustedInput);
    const after = freshnessFingerprint(currentInput);

    if (before === after) continue;

    // Evidence that was missing and is now available is new information, not a
    // contradiction. The decision was made without it and remains valid; the
    // reviewer is told so they can choose to look.
    const gainedEvidence =
      trustedInput.status !== "available" && currentInput.status === "available";

    changes.push({
      kind: gainedEvidence ? "evidence_availability" : "freshness_input",
      label,
      trusted: before,
      current: after,
      invalidatesDecision: !gainedEvidence
    });
  }

  for (const [label, currentInput] of currentInputs) {
    if (trustedInputs.has(label)) continue;

    changes.push({
      kind: "evidence_availability",
      label: `${label} appeared after the decision`,
      trusted: "absent",
      current: currentInput.status,
      invalidatesDecision: false
    });
  }

  const decisionStale = changes.some((change) => change.invalidatesDecision);
  const unchanged = changes.length === 0;

  return {
    trustedDecisionHash: trusted.decisionHash,
    trustedDecidedAt: trusted.decidedAt,
    changes,
    unchanged,
    decisionStale,
    summary: unchanged
      ? `Nothing has moved since the decision of ${trusted.decidedAt}. The earlier review still covers this state.`
      : decisionStale
        ? `${changes.filter((change) => change.invalidatesDecision).length} of ${changes.length} changes since ${trusted.decidedAt} invalidate the earlier review.`
        : `${changes.length} change(s) since ${trusted.decidedAt}, none of which invalidate the earlier review.`
  };
}
