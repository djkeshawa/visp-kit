import { describe, expect, it } from "vitest";

import { oraclePlanSchema } from "../../../src/artifacts/schemas/oracle-plan.schema.js";

function plan() {
  const binding = {
    path: ".visp/features/001-example/spec.json",
    sha256: `sha256:${"a".repeat(64)}`
  };

  return {
    version: "1.0",
    featureId: "001",
    featureSlug: "example",
    taskId: "T001",
    assuranceProfile: "behavioral",
    criticalReviewApproval: { required: false, status: "not_required" },
    oracles: [
      {
        id: "ORACLE-AC001",
        requirementId: "REQ001",
        acceptanceCriterionId: "AC001",
        description: "The behavior is observable.",
        priority: "must",
        validationMethod: "unit",
        baseline: { expected: "recorded" },
        candidate: { expected: "passed" }
      }
    ],
    validationCommands: ["pnpm test"],
    testStrengthEvidence: [],
    bindings: {
      policy: binding,
      specification: binding,
      plan: binding,
      taskGraph: binding,
      context: binding,
      task: { id: "T001", sha256: `sha256:${"b".repeat(64)}` }
    },
    baseCommit: { status: "unavailable", reason: "Target is not a Git repository." },
    requiredProviders: [{ id: "command", version: "1.0" }],
    generatedAt: "2026-07-25T00:00:00.000Z"
  };
}

describe("oraclePlanSchema", () => {
  it("accepts a complete behavioral oracle plan", () => {
    expect(oraclePlanSchema.safeParse(plan()).success).toBe(true);
  });

  it("rejects duplicate criteria and validation commands", () => {
    const value = plan();
    value.oracles.push({ ...value.oracles[0]!, id: "ORACLE-AC002" });
    value.validationCommands.push("pnpm test");

    const result = oraclePlanSchema.safeParse(value);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "Duplicate acceptance criterion: AC001.",
          "Validation commands must be unique."
        ])
      );
    }
  });

  it("requires a pending critical review marker only for critical assurance", () => {
    const value = plan();
    value.assuranceProfile = "critical";

    const result = oraclePlanSchema.safeParse(value);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("Critical review approval");
    }
  });

  it("accepts explicit pre-approved test-strength evidence", () => {
    const value = plan();
    value.testStrengthEvidence.push({
      path: "tests/example.test.ts",
      sha256: `sha256:${"c".repeat(64)}`,
      independence: "pre_approved",
      source: {
        kind: "explicit_pre_approval",
        reference: "VISP-TEST-APPROVAL-001"
      }
    } as never);

    expect(oraclePlanSchema.safeParse(value).success).toBe(true);
  });
});
