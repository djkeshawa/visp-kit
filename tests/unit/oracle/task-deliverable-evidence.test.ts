import { describe, expect, it } from "vitest";

import { evaluateCandidateTestStrength } from "../../../src/workflows/candidate-verification.workflow.js";

const deliverable = {
  path: "tests/site.spec.js",
  sha256: `sha256:${"a".repeat(64)}`,
  independence: "task_deliverable" as const,
  source: {
    kind: "declared_task_deliverable" as const,
    taskId: "T001",
    taskClass: "regression_test" as const
  }
};

const preExisting = {
  path: "tests/other.spec.js",
  sha256: `sha256:${"b".repeat(64)}`,
  independence: "pre_existing" as const,
  source: { kind: "git_base_commit" as const, commit: "c".repeat(40) }
};

describe("a task's own declared test is not independent evidence", () => {
  it("does not satisfy independence for behavioral assurance", () => {
    const result = evaluateCandidateTestStrength({
      assuranceProfile: "behavioral",
      testStrengthEvidence: [deliverable]
    } as never);

    // The whole point: a self-authored test must not launder into a pass.
    expect(result.status).toBe("inconclusive");
    expect(result.independence).toEqual([]);
    expect(result.reason).toContain("does not qualify");
  });

  it("does not satisfy independence for critical assurance", () => {
    const result = evaluateCandidateTestStrength({
      assuranceProfile: "critical",
      testStrengthEvidence: [deliverable]
    } as never);

    expect(result.status).toBe("inconclusive");
    expect(result.independence).toEqual([]);
  });

  it("still passes behavioral assurance when genuinely independent evidence is present", () => {
    const result = evaluateCandidateTestStrength({
      assuranceProfile: "behavioral",
      testStrengthEvidence: [deliverable, preExisting]
    } as never);

    expect(result.status).toBe("passed");
    // The deliverable is excluded from the reported independence signals.
    expect(result.independence).toEqual(["pre_existing"]);
  });

  it("passes routine assurance, which requires no independent signal", () => {
    const result = evaluateCandidateTestStrength({
      assuranceProfile: "routine",
      testStrengthEvidence: [deliverable]
    } as never);

    expect(result.status).toBe("passed");
    expect(result.independence).toEqual([]);
  });

  it("preserves prior behaviour for pre-approved evidence", () => {
    const preApproved = {
      path: "tests/x.spec.js",
      sha256: `sha256:${"d".repeat(64)}`,
      independence: "pre_approved" as const,
      source: { kind: "explicit_pre_approval" as const, reference: "visp oracle plan" }
    };
    const result = evaluateCandidateTestStrength({
      assuranceProfile: "behavioral",
      testStrengthEvidence: [preApproved]
    } as never);

    expect(result.status).toBe("passed");
    expect(result.independence).toEqual(["pre_approved"]);
  });
});
