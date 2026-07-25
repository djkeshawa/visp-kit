import { describe, expect, it } from "vitest";

import { buildEvidenceComparisons } from "../../../src/assurance/evidence-comparison.js";
import { type AssuranceCaseWithoutHash } from "../../../src/artifacts/schemas/assurance-case.schema.js";
import { type BaselineEvidence } from "../../../src/artifacts/schemas/baseline-evidence.schema.js";
import { type CandidateEvidence } from "../../../src/artifacts/schemas/candidate-evidence.schema.js";
import { type EvidenceProviderRun } from "../../../src/artifacts/schemas/provider-run.schema.js";
import { type OraclePlanOracle } from "../../../src/artifacts/schemas/oracle-plan.schema.js";

const oracle: OraclePlanOracle = {
  id: "O001",
  requirementId: "REQ001",
  acceptanceCriterionId: "AC001",
  description: "Verify behavior.",
  priority: "must",
  validationMethod: "unit",
  baseline: { expected: "failed" },
  candidate: { expected: "passed" }
};

const claims: AssuranceCaseWithoutHash["claims"] = [
  {
    id: "CL001",
    source: {
      kind: "acceptance_criterion",
      requirementId: "REQ001",
      acceptanceCriterionId: "AC001"
    },
    priority: "must",
    assuranceProfile: "behavioral",
    statement: "Behavior works.",
    disposition: "mapped",
    changeUnitIds: ["CU001"],
    evidenceComparisonIds: ["EC-O001"],
    unresolvedItemIds: []
  }
];

function providerRun(input: {
  phase: "baseline" | "candidate";
  freshness?: "fresh" | "stale" | "unknown";
  independence?: "pre_existing" | "implementer_authored";
  failure?: boolean;
  oracleId?: string;
  outcome?: "passed" | "failed" | "inconclusive";
  provider?: { id: string; version: string };
}): EvidenceProviderRun {
  if (input.failure) {
    return {
      version: "1.0",
      id: `${input.phase}-run`,
      provider: input.provider ?? { id: "vitest", version: "1" },
      phase: input.phase,
      status: "inconclusive",
      failure: { code: "timeout", reason: "Provider timed out." },
      results: []
    };
  }
  const freshness = input.freshness ?? "fresh";
  return {
    version: "1.0",
    id: `${input.phase}-run`,
    provider: input.provider ?? { id: "vitest", version: "1" },
    phase: input.phase,
    status: "passed",
    failure: null,
    results: [
      {
        version: "1.0",
        id: `${input.phase}-result`,
        requirementId: "REQ001",
        provider: input.provider ?? { id: "vitest", version: "1" },
        target: { kind: "validation_oracle", oracleId: input.oracleId ?? "O001" },
        operation: { kind: "inspection", inspector: "vitest", subject: "O001" },
        inputHashes: [],
        startedAt: "2026-07-25T00:00:00.000Z",
        endedAt: "2026-07-25T00:00:01.000Z",
        freshness:
          freshness === "fresh"
            ? { status: "fresh", checkedAt: "2026-07-25T00:00:01.000Z", inputHashes: [] }
            : {
                status: freshness,
                checkedAt: "2026-07-25T00:00:01.000Z",
                inputHashes: [],
                reason: `${freshness} evidence`
              },
        independence: input.independence ?? "pre_existing",
        output: { kind: "none", reason: "Test fixture." },
        outcome:
          input.outcome === "failed"
            ? { status: "failed", reason: "Relevant proof failed." }
            : input.outcome === "inconclusive"
              ? { status: "inconclusive", reason: "Relevant proof inconclusive." }
              : { status: "passed" }
      }
    ]
  };
}

function baseline(
  outcome: "passed" | "failed" | "inconclusive",
  runs: EvidenceProviderRun[] = [providerRun({ phase: "baseline" })]
): BaselineEvidence {
  return {
    outcome: "passed",
    oracles: [
      {
        oracleId: "O001",
        expected: "failed",
        observed: outcome,
        expectationMet: true
      }
    ],
    providerRuns: runs
  } as BaselineEvidence;
}

function candidate(
  outcome: "passed" | "failed" | "inconclusive",
  runs: EvidenceProviderRun[] = [
    providerRun({ phase: "candidate", independence: "implementer_authored" })
  ]
): CandidateEvidence {
  return {
    outcome,
    oracles: [
      {
        oracleId: "O001",
        baseline: { expected: "failed", observed: "failed", expectationMet: true },
        candidate: { expected: "passed", observed: outcome, expectationMet: outcome === "passed" },
        outcome
      }
    ],
    providerRuns: runs,
    testStrength: {
      status: "passed",
      independence: ["pre_existing"],
      reason: "Fixture."
    }
  } as CandidateEvidence;
}

describe("buildEvidenceComparisons", () => {
  it.each([
    ["failed", "passed", "improved"],
    ["passed", "passed", "unchanged"],
    ["passed", "failed", "regressed"],
    ["inconclusive", "passed", "inconclusive"]
  ] as const)("maps baseline %s and candidate %s to %s", (baselineOutcome, candidateOutcome, expected) => {
    const [comparison] = buildEvidenceComparisons({
      oracles: [oracle],
      claims,
      baseline: baseline(baselineOutcome),
      candidate: candidate(candidateOutcome),
      baselineBindingId: "baseline_evidence",
      candidateBindingId: "candidate_evidence"
    });
    expect(comparison?.conclusion).toBe(expected);
    expect(comparison?.baseline.source.bindingId).toBe("baseline_evidence");
    expect(comparison?.candidate.source.bindingId).toBe("candidate_evidence");
    expect(comparison?.claimIds).toEqual(["CL001"]);
    expect(comparison?.providers).toEqual([{ id: "vitest", version: "1" }]);
  });

  it.each([
    ["missing candidate", undefined, [providerRun({ phase: "baseline" })], "unknown"],
    [
      "stale candidate",
      candidate("passed", [providerRun({ phase: "candidate", freshness: "stale" })]),
      [providerRun({ phase: "baseline" })],
      "stale"
    ],
    [
      "unknown candidate",
      candidate("passed", [providerRun({ phase: "candidate", freshness: "unknown" })]),
      [providerRun({ phase: "baseline" })],
      "unknown"
    ],
    [
      "provider failure",
      candidate("inconclusive", [providerRun({ phase: "candidate", failure: true })]),
      [providerRun({ phase: "baseline" })],
      "unknown"
    ]
  ] as const)("makes %s explicit and inconclusive", (_label, candidateEvidence, baselineRuns, expected) => {
    const [comparison] = buildEvidenceComparisons({
      oracles: [oracle],
      claims,
      baseline: baseline("failed", [...baselineRuns]),
      candidate: candidateEvidence,
      baselineBindingId: "baseline_evidence",
      candidateBindingId: "candidate_evidence"
    });
    expect(comparison?.candidate.freshness).toBe(expected);
    expect(comparison?.candidate.uncertainty.status).toBe("unresolved");
    expect(comparison?.candidate.uncertainty.reasons.length).toBeGreaterThan(0);
    expect(comparison?.conclusion).toBe("inconclusive");
    if (candidateEvidence === undefined) {
      expect(comparison?.candidate.source.evidenceIds).not.toContain("candidate-oracle:O001");
    }
  });

  it.each([
    [
      "top-level candidate failure",
      { ...candidate("passed"), outcome: "failed" as const },
      "failed"
    ],
    [
      "inconclusive test strength",
      {
        ...candidate("passed"),
        testStrength: {
          status: "inconclusive" as const,
          independence: ["pre_existing" as const],
          reason: "Independent proof is missing."
        }
      },
      "inconclusive"
    ],
    [
      "failed exact provider result",
      candidate("passed", [providerRun({ phase: "candidate", outcome: "failed" })]),
      "failed"
    ],
    [
      "same-requirement wrong-oracle result",
      candidate("passed", [providerRun({ phase: "candidate", oracleId: "O999" })]),
      "inconclusive"
    ]
  ])("never improves with %s", (_label, candidateEvidence, expectedOutcome) => {
    const [comparison] = buildEvidenceComparisons({
      oracles: [oracle],
      claims,
      baseline: baseline("failed"),
      candidate: candidateEvidence,
      baselineBindingId: "baseline_evidence",
      candidateBindingId: "candidate_evidence",
      requiredProviders: [{ id: "vitest", version: "1" }]
    });
    expect(comparison?.candidate.outcome).toBe(expectedOutcome);
    expect(comparison?.conclusion).not.toBe("improved");
  });

  it("preserves every exact provider identity and version", () => {
    const [comparison] = buildEvidenceComparisons({
      oracles: [oracle],
      claims,
      baseline: baseline("failed"),
      candidate: candidate("passed", [
        providerRun({
          phase: "candidate",
          provider: { id: "vitest", version: "3" }
        }),
        providerRun({
          phase: "candidate",
          provider: { id: "coverage", version: "2" }
        })
      ]),
      baselineBindingId: "baseline_evidence",
      candidateBindingId: "candidate_evidence",
      requiredProviders: [
        { id: "coverage", version: "2" },
        { id: "vitest", version: "3" }
      ]
    });
    expect(comparison?.providers).toEqual([
      { id: "coverage", version: "2" },
      { id: "vitest", version: "1" },
      { id: "vitest", version: "3" }
    ]);
  });

  it("does not invent a provider identity when only oracle artifact evidence exists", () => {
    const [comparison] = buildEvidenceComparisons({
      oracles: [oracle],
      claims,
      baseline: baseline("failed", []),
      candidate: candidate("passed", []),
      baselineBindingId: "baseline_evidence",
      candidateBindingId: "candidate_evidence",
      requiredProviders: []
    });

    expect(comparison?.providers).toEqual([]);
    expect(comparison?.baseline.source.evidenceIds).toContain("baseline-oracle:O001");
    expect(comparison?.candidate.source.evidenceIds).toContain("candidate-oracle:O001");
  });
});
