import { describe, expect, it } from "vitest";

import {
  oracleApprovalSchema,
  oracleAuthorizationBindingSchema,
  oracleLockSchema
} from "../../../src/artifacts/schemas/oracle-authorization.schema.js";

const hash = `sha256:${"a".repeat(64)}`;
const binding = { path: ".visp/features/001-example/oracle-plan.json", sha256: hash };

describe("oracle authorization schemas", () => {
  it("accepts active approval, lock, and marker bindings", () => {
    expect(
      oracleApprovalSchema.safeParse({
        version: "1.0",
        taskId: "T001",
        oraclePlan: binding,
        reviewerId: "reviewer-1",
        reason: "Critical behavior was reviewed.",
        status: "approved",
        approvedAt: "2026-07-25T00:00:00.000Z",
        expiresAt: null,
        revokedAt: null,
        revokedReason: null
      }).success
    ).toBe(true);
    expect(
      oracleLockSchema.safeParse({
        version: "1.0",
        taskId: "T001",
        assuranceProfile: "behavioral",
        oraclePlan: binding,
        approval: null,
        baseCommit: { status: "captured", commit: "b".repeat(40) },
        bindings: {
          policy: binding,
          specification: binding,
          plan: binding,
          taskGraph: binding,
          context: binding,
          task: { id: "T001", sha256: hash }
        },
        validationCommandsSha256: hash,
        testStrengthEvidenceSha256: hash,
        lockHash: hash,
        lockedAt: "2026-07-25T00:00:00.000Z"
      }).success
    ).toBe(true);
    expect(
      oracleAuthorizationBindingSchema.safeParse({
        lockPath: ".visp/features/001-example/oracle-lock.json",
        lockHash: hash,
        lockFileSha256: hash
      }).success
    ).toBe(true);
  });

  it("fails closed for inconsistent revocation fields", () => {
    const result = oracleApprovalSchema.safeParse({
      version: "1.0",
      taskId: "T001",
      oraclePlan: binding,
      reviewerId: "reviewer-1",
      reason: "Critical behavior was reviewed.",
      status: "revoked",
      approvedAt: "2026-07-25T00:00:00.000Z",
      expiresAt: null,
      revokedAt: null,
      revokedReason: null
    });

    expect(result.success).toBe(false);
  });
});
