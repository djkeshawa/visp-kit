import { describe, expect, it } from "vitest";

import {
  assuranceProfileSchema,
  evidenceProviderIdentitySchema,
  evidenceRequirementSchema,
  evidenceResultSchema,
  evidenceStatusSchema
} from "../../../../src/artifacts/schemas/evidence.schema.js";

const digest = `sha256:${"a".repeat(64)}`;

const requirement = {
  version: "1.0",
  id: "EVID001",
  providerId: "unit-tests",
  target: { kind: "command", command: "pnpm test" },
  freshnessRule: "Inputs must match their recorded SHA-256 hashes.",
  independenceRule: "Use pre-existing tests.",
  requiredVerdict: "passed"
} as const;

function result(outcome: object = { status: "passed" }): object {
  return {
    version: "1.0",
    id: "ERES001",
    requirementId: "EVID001",
    provider: { id: "unit-tests", version: "3.2.4" },
    target: { kind: "command", command: "pnpm test" },
    operation: {
      kind: "command",
      executable: "pnpm",
      args: ["test"],
      cwd: "."
    },
    inputHashes: [{ id: "task", sha256: digest }],
    startedAt: "2026-07-23T00:00:00.000Z",
    endedAt: "2026-07-23T00:01:00.000Z",
    freshness: {
      status: "fresh",
      checkedAt: "2026-07-23T00:01:00.000Z",
      inputHashes: [{ id: "task", sha256: digest }]
    },
    independence: "pre_existing",
    output: {
      kind: "captured",
      stdout: "937 tests passed",
      stderr: "",
      truncated: false
    },
    outcome
  };
}

describe("evidence schemas", () => {
  it("defines stable assurance profiles and evidence statuses", () => {
    for (const value of ["routine", "behavioral", "critical"]) {
      expect(assuranceProfileSchema.safeParse(value).success).toBe(true);
    }
    for (const value of ["passed", "failed", "inconclusive", "not_applicable"]) {
      expect(evidenceStatusSchema.safeParse(value).success).toBe(true);
    }
    expect(evidenceStatusSchema.safeParse("skipped").success).toBe(false);
  });

  it("requires a versioned provider identity and preserves the v3 requirement shape", () => {
    expect(
      evidenceProviderIdentitySchema.safeParse({ id: "unit-tests", version: "3.2.4" }).success
    ).toBe(true);
    expect(evidenceProviderIdentitySchema.safeParse({ id: "unit-tests" }).success).toBe(false);
    expect(evidenceRequirementSchema.safeParse(requirement).success).toBe(true);
    expect(
      evidenceRequirementSchema.safeParse({ ...requirement, requiredVerdict: "inconclusive" })
        .success
    ).toBe(false);
  });

  it("accepts a complete passed evidence result", () => {
    expect(evidenceResultSchema.safeParse(result()).success).toBe(true);
  });

  it.each([
    ["failed", { status: "failed" }],
    ["inconclusive", { status: "inconclusive" }]
  ])("requires a reason for %s evidence", (_label, outcome) => {
    expect(evidenceResultSchema.safeParse(result(outcome)).success).toBe(false);
    expect(
      evidenceResultSchema.safeParse(
        result({ ...outcome, reason: "The command did not prove the claim." })
      ).success
    ).toBe(true);
  });

  it("requires an auditable rule or override for not_applicable", () => {
    expect(
      evidenceResultSchema.safeParse(
        result({ status: "not_applicable", reason: "No security boundary changed." })
      ).success
    ).toBe(false);
    expect(
      evidenceResultSchema.safeParse(
        result({
          status: "not_applicable",
          reason: "The project rule excludes documentation-only changes.",
          determination: { kind: "rule", ruleId: "VSP-EVID-001" }
        })
      ).success
    ).toBe(true);
    expect(
      evidenceResultSchema.safeParse(
        result({
          status: "not_applicable",
          reason: "A human approved the exception.",
          determination: { kind: "override", overrideId: "OVR001" }
        })
      ).success
    ).toBe(true);
  });

  it("keeps implementer-authored evidence explicit and validates hashes", () => {
    expect(
      evidenceResultSchema.safeParse({ ...result(), independence: "implementer_authored" }).success
    ).toBe(true);
    const invalid = result() as {
      inputHashes: Array<{ id: string; sha256: string }>;
    };
    invalid.inputHashes[0]!.sha256 = "abc";
    expect(evidenceResultSchema.safeParse(invalid).success).toBe(false);
  });

  it("supports inspections and referenced or absent output", () => {
    expect(
      evidenceResultSchema.safeParse({
        ...result(),
        operation: {
          kind: "inspection",
          inspector: "human-review",
          subject: "authorization boundary"
        },
        independence: "human_attestation",
        output: {
          kind: "reference",
          reference: ".visp/evidence/review.json",
          sha256: digest
        }
      }).success
    ).toBe(true);
    expect(
      evidenceResultSchema.safeParse({
        ...result(),
        output: { kind: "none", reason: "The provider returned no output." }
      }).success
    ).toBe(true);
  });

  it("represents stale and unknown freshness and rejects inverted timestamps", () => {
    for (const status of ["stale", "unknown"] as const) {
      expect(
        evidenceResultSchema.safeParse({
          ...result(),
          freshness: {
            status,
            checkedAt: "2026-07-23T00:01:00.000Z",
            inputHashes: [{ id: "task", sha256: digest }],
            reason: "The current inputs could not be matched."
          }
        }).success
      ).toBe(true);
    }
    expect(
      evidenceResultSchema.safeParse({
        ...result(),
        endedAt: "2026-07-22T23:59:00.000Z"
      }).success
    ).toBe(false);
  });
});
