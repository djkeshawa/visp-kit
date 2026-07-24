import { describe, expect, it } from "vitest";

import { candidateEvidenceSchema } from "../../../src/artifacts/schemas/candidate-evidence.schema.js";

const hash = `sha256:${"a".repeat(64)}`;

describe("candidateEvidenceSchema", () => {
  it("accepts a baseline-bound candidate comparison", () => {
    const result = candidateEvidenceSchema.safeParse({
      version: "1.0",
      id: "CANDIDATE-001-T001",
      featureId: "001",
      featureSlug: "example",
      taskId: "T001",
      oraclePlan: { path: ".visp/oracle-plan.json", sha256: hash },
      oracleAuthorization: {
        lockPath: ".visp/oracle-lock.json",
        lockHash: hash,
        lockFileSha256: hash
      },
      baselineEvidence: { path: ".visp/baseline-evidence.json", sha256: hash },
      baselineCacheKeySha256: hash,
      testStrength: {
        status: "passed",
        independence: ["pre_existing"],
        reason: "Pre-existing test evidence is locked."
      },
      oracles: [
        {
          oracleId: "ORACLE-AC001",
          baseline: {
            expected: "recorded",
            observed: "failed",
            expectationMet: true
          },
          candidate: {
            expected: "passed",
            observed: "passed",
            expectationMet: true
          },
          outcome: "passed"
        }
      ],
      providerRuns: [],
      commands: [],
      outcome: "passed",
      generatedAt: "2026-07-25T00:00:00.000Z",
      evidenceHash: hash
    });

    expect(result.success).toBe(true);
  });
});
