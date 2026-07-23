import {
  type EvidenceRequirement,
  type EvidenceResult,
  type EvidenceStatus,
  type EvidenceTarget
} from "../artifacts/schemas/evidence.schema.js";

export type EvidenceRequirementEvaluation = {
  readonly status: EvidenceStatus;
  readonly satisfied: boolean;
  readonly reasonCode:
    | "missing_result"
    | "binding_mismatch"
    | "result_not_passed"
    | "freshness_not_proven"
    | null;
};

function targetsMatch(expected: EvidenceTarget, actual: EvidenceTarget): boolean {
  if (expected.kind !== actual.kind) {
    return false;
  }

  switch (expected.kind) {
    case "command":
      return actual.kind === "command" && expected.command === actual.command;
    case "validation_oracle":
      return actual.kind === "validation_oracle" && expected.oracleId === actual.oracleId;
    case "static_check":
      return actual.kind === "static_check" && expected.checkId === actual.checkId;
    case "security_check":
      return actual.kind === "security_check" && expected.checkId === actual.checkId;
    case "human_review":
      return actual.kind === "human_review" && expected.reviewId === actual.reviewId;
  }
}

export function evaluateEvidenceRequirement(
  requirement: EvidenceRequirement,
  result: EvidenceResult | undefined
): EvidenceRequirementEvaluation {
  if (result === undefined) {
    return {
      status: "inconclusive",
      satisfied: false,
      reasonCode: "missing_result"
    };
  }

  if (
    result.requirementId !== requirement.id ||
    result.provider.id !== requirement.providerId ||
    !targetsMatch(requirement.target, result.target)
  ) {
    return {
      status: "inconclusive",
      satisfied: false,
      reasonCode: "binding_mismatch"
    };
  }

  if (result.outcome.status !== requirement.requiredVerdict) {
    return {
      status: result.outcome.status,
      satisfied: false,
      reasonCode: "result_not_passed"
    };
  }

  if (result.freshness.status !== "fresh") {
    return {
      status: "inconclusive",
      satisfied: false,
      reasonCode: "freshness_not_proven"
    };
  }

  return {
    status: "passed",
    satisfied: true,
    reasonCode: null
  };
}
