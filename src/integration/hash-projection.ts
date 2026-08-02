// Hash projections (D-119, P10-US-01).
//
// Identity hashes must describe what was decided and reviewed — scope, claims,
// oracles, findings, verdicts — never what the CLI happens to be called. Both
// hash paths previously canonicalized the entire persisted object, so renaming
// a command moved every identity. Each projection below deletes the designated
// wording fields before canonicalization; the persisted artifact keeps them.
//
// Rules:
// - `nextCommand` / `nextAction` are UI guidance, not identity. Excluded.
// - A finding's identity is its `code`, `source`, `severity` and `effect`.
//   `message`, `recommendation` and `evidence` are wording (they embed command
//   strings today) and are excluded.
// - `assuranceSummary` is a derived observation of previously recorded
//   artifacts — it quotes the prior case's own hash, so hashing it makes
//   assurance generation self-referential and non-idempotent (the 3.1 pin
//   existed to dodge exactly that). It stays in the payload for coordinators
//   and leaves the identity. Excluded.
// - `validationCommands` are the *project's own* commands (its test suite),
//   part of the contract being validated. Included.

import { type Finding } from "./canonical-workflow-action.js";

export type ProjectedFinding = {
  readonly code: string;
  readonly source: Finding["source"];
  readonly severity: Finding["severity"];
  readonly effect: Finding["effect"];
};

export function projectFinding(finding: Finding): ProjectedFinding {
  return {
    code: finding.code,
    source: finding.source,
    severity: finding.severity,
    effect: finding.effect
  };
}

/**
 * Projects a workflow-action identity input for canonical-1.3 hashing.
 * Deletes `nextCommand` and reduces findings to their semantic identity.
 * Accepts the identity input as a plain record so the projection stays
 * mechanical; the caller owns type correctness of the surrounding envelope.
 */
export function workflowActionHashProjectionV1_3(
  identityInput: Record<string, unknown>
): Record<string, unknown> {
  const {
    nextCommand: _nextCommand,
    assuranceSummary: _assuranceSummary,
    findings,
    ...rest
  } = identityInput;
  return {
    ...rest,
    findings: Array.isArray(findings) ? findings.map((f) => projectFinding(f as Finding)) : []
  };
}

/**
 * Projects an assurance case for canonical-1.1 hashing: the persisted
 * `nextAction` (command + reason wording) leaves the hash input entirely.
 */
export function assuranceCaseHashProjectionV1_1<T extends { readonly nextAction?: unknown }>(
  assuranceCaseWithoutHash: T
): Omit<T, "nextAction"> {
  const { nextAction: _nextAction, ...rest } = assuranceCaseWithoutHash;
  return rest;
}
