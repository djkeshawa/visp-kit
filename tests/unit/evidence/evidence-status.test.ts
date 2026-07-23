import { describe, expect, it } from "vitest";

import { evaluateEvidenceRequirement } from "../../../src/evidence/evidence-status.js";
import {
  type EvidenceRequirement,
  type EvidenceResult
} from "../../../src/artifacts/schemas/evidence.schema.js";

const digest = `sha256:${"b".repeat(64)}` as const;

const requirement: EvidenceRequirement = {
  version: "1.0",
  id: "EVID001",
  providerId: "unit-tests",
  target: { kind: "command", command: "pnpm test" },
  freshnessRule: "Inputs must match.",
  independenceRule: "Use pre-existing tests.",
  requiredVerdict: "passed"
};

function result(outcome: EvidenceResult["outcome"] = { status: "passed" }): EvidenceResult {
  return {
    version: "1.0",
    id: "ERES001",
    requirementId: requirement.id,
    provider: { id: requirement.providerId, version: "3.2.4" },
    target: requirement.target,
    operation: { kind: "command", executable: "pnpm", args: ["test"], cwd: "." },
    inputHashes: [{ id: "task", sha256: digest }],
    startedAt: "2026-07-23T00:00:00.000Z",
    endedAt: "2026-07-23T00:01:00.000Z",
    freshness: {
      status: "fresh",
      checkedAt: "2026-07-23T00:01:00.000Z",
      inputHashes: [{ id: "task", sha256: digest }]
    },
    independence: "pre_existing",
    output: { kind: "captured", stdout: "passed", stderr: "", truncated: false },
    outcome
  };
}

describe("strict evidence status evaluation", () => {
  it("treats missing required evidence as inconclusive, never passed", () => {
    expect(evaluateEvidenceRequirement(requirement, undefined)).toEqual({
      status: "inconclusive",
      satisfied: false,
      reasonCode: "missing_result"
    });
  });

  it("accepts only a matching passed result", () => {
    expect(evaluateEvidenceRequirement(requirement, result())).toEqual({
      status: "passed",
      satisfied: true,
      reasonCode: null
    });
  });

  it.each([
    [{ status: "failed", reason: "The command failed." } as const, "failed"],
    [{ status: "inconclusive", reason: "Output was unavailable." } as const, "inconclusive"],
    [
      {
        status: "not_applicable",
        reason: "An approved rule excludes it.",
        determination: { kind: "rule", ruleId: "VSP-EVID-001" }
      } as const,
      "not_applicable"
    ]
  ])("does not satisfy strict evidence with %s", (outcome, expectedStatus) => {
    expect(evaluateEvidenceRequirement(requirement, result(outcome))).toEqual({
      status: expectedStatus,
      satisfied: false,
      reasonCode: "result_not_passed"
    });
  });

  it("rejects a passed result bound to another provider or target", () => {
    expect(
      evaluateEvidenceRequirement(requirement, {
        ...result(),
        provider: { id: "other-provider", version: "1.0.0" }
      })
    ).toEqual({
      status: "inconclusive",
      satisfied: false,
      reasonCode: "binding_mismatch"
    });
    expect(
      evaluateEvidenceRequirement(requirement, {
        ...result(),
        target: { kind: "command", command: "pnpm test:other" }
      })
    ).toEqual({
      status: "inconclusive",
      satisfied: false,
      reasonCode: "binding_mismatch"
    });
  });

  it.each([
    "stale",
    "unknown"
  ] as const)("does not satisfy strict evidence when freshness is %s", (status) => {
    expect(
      evaluateEvidenceRequirement(requirement, {
        ...result(),
        freshness: {
          status,
          checkedAt: "2026-07-23T00:01:00.000Z",
          inputHashes: [{ id: "task", sha256: digest }],
          reason: "The current inputs could not be matched."
        }
      })
    ).toEqual({
      status: "inconclusive",
      satisfied: false,
      reasonCode: "freshness_not_proven"
    });
  });
});
