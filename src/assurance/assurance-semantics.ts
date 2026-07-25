import { hashOracleValue } from "../oracle/oracle-authorization.js";

export type SemanticEvidenceSide = {
  readonly outcome: "passed" | "failed" | "inconclusive" | "not_applicable";
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly uncertainty: {
    readonly status: "none" | "known" | "unresolved";
    readonly reasons: readonly string[];
  };
};

export function deriveEvidenceConclusion(
  baseline: SemanticEvidenceSide,
  candidate: SemanticEvidenceSide
): "improved" | "unchanged" | "regressed" | "inconclusive" {
  if (
    baseline.freshness !== "fresh" ||
    candidate.freshness !== "fresh" ||
    baseline.uncertainty.status !== "none" ||
    candidate.uncertainty.status !== "none" ||
    baseline.outcome === "inconclusive" ||
    candidate.outcome === "inconclusive" ||
    baseline.outcome === "not_applicable" ||
    candidate.outcome === "not_applicable"
  ) {
    return "inconclusive";
  }
  if (baseline.outcome === candidate.outcome) return "unchanged";
  if (candidate.outcome === "passed" && baseline.outcome === "failed") return "improved";
  if (candidate.outcome === "failed" && baseline.outcome === "passed") return "regressed";
  return "inconclusive";
}

export function deriveClaimDisposition(input: {
  readonly priority: "must" | "should" | "could" | "wont";
  readonly changeUnitIds: readonly string[];
  readonly evidenceComparisonIds: readonly string[];
}): "mapped" | "unresolved" | "unmapped" {
  if (input.changeUnitIds.length > 0 || input.evidenceComparisonIds.length > 0) return "mapped";
  return input.priority === "must" ? "unresolved" : "unmapped";
}

export function deriveAssuranceVerdict(input: {
  readonly evidenceComparisons: readonly {
    readonly conclusion: "improved" | "unchanged" | "regressed" | "inconclusive";
    readonly candidate: SemanticEvidenceSide;
  }[];
  readonly unresolvedItems: readonly unknown[];
  readonly manualChecks: readonly {
    readonly status: "pending" | "passed" | "failed" | "not_applicable";
  }[];
  readonly challengerFindings: readonly {
    readonly severity: "critical" | "high" | "medium";
    readonly status: "open" | "resolved" | "accepted";
  }[];
}): "passed" | "failed" | "inconclusive" {
  if (
    input.evidenceComparisons.some(
      (comparison) =>
        comparison.conclusion === "regressed" || comparison.candidate.outcome === "failed"
    ) ||
    input.manualChecks.some((check) => check.status === "failed") ||
    input.challengerFindings.some(
      (finding) => finding.severity === "critical" && finding.status === "open"
    )
  ) {
    return "failed";
  }
  if (
    input.unresolvedItems.length > 0 ||
    input.evidenceComparisons.some((comparison) => comparison.conclusion === "inconclusive") ||
    input.manualChecks.some((check) => check.status === "pending") ||
    input.challengerFindings.some((finding) => finding.status === "open")
  ) {
    return "inconclusive";
  }
  return "passed";
}

export function deriveCandidateStateSha(input: {
  readonly actionId: string;
  readonly diffStateSha256: string;
  readonly candidateEvidenceBinding: unknown;
}): `sha256:${string}` {
  return hashOracleValue({
    actionId: input.actionId,
    diffStateSha256: input.diffStateSha256,
    candidateEvidenceBinding: input.candidateEvidenceBinding
  });
}
