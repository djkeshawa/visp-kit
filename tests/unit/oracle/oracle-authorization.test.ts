import { describe, expect, it } from "vitest";

import { type OraclePlan } from "../../../src/artifacts/schemas/oracle-plan.schema.js";
import {
  createOracleApproval,
  createOracleLock,
  revokeOracleApproval,
  validateOracleLock
} from "../../../src/oracle/oracle-authorization.js";

const hash = `sha256:${"a".repeat(64)}` as const;
const binding = { path: ".visp/features/001-example/spec.json", sha256: hash };

function plan(profile: OraclePlan["assuranceProfile"] = "behavioral"): OraclePlan {
  return {
    version: "1.0",
    featureId: "001",
    featureSlug: "example",
    taskId: "T001",
    assuranceProfile: profile,
    criticalReviewApproval:
      profile === "critical"
        ? { required: true, status: "pending" }
        : { required: false, status: "not_required" },
    oracles: [],
    validationCommands: ["pnpm test"],
    testStrengthEvidence: [],
    bindings: {
      policy: binding,
      specification: binding,
      plan: binding,
      taskGraph: binding,
      context: binding,
      task: { id: "T001", sha256: hash }
    },
    baseCommit: { status: "captured", commit: "b".repeat(40) },
    requiredProviders: [{ id: "command", version: "1.0" }],
    generatedAt: "2026-07-25T00:00:00.000Z"
  };
}

const planPath = ".visp/features/001-example/assurance/T001/oracle-plan.json";
const approvalPath = ".visp/features/001-example/assurance/T001/oracle-approval.json";

describe("oracle authorization", () => {
  it("produces a deterministic lock hash independent of lockedAt", () => {
    const first = createOracleLock({
      plan: plan(),
      planPath,
      lockedAt: "2026-07-25T01:00:00.000Z"
    });
    const second = createOracleLock({
      plan: plan(),
      planPath,
      lockedAt: "2026-07-25T02:00:00.000Z"
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.lockHash).toBe(second.value.lockHash);
    expect(first.value.lockedAt).not.toBe(second.value.lockedAt);
  });

  it("changes the lock identity when baseline evidence changes", () => {
    const first = createOracleLock({
      plan: plan(),
      planPath,
      baselineEvidence: {
        path: ".visp/features/001-example/assurance/T001/baseline-evidence.json",
        sha256: `sha256:${"c".repeat(64)}`
      },
      lockedAt: "2026-07-25T01:00:00.000Z"
    });
    const second = createOracleLock({
      plan: plan(),
      planPath,
      baselineEvidence: {
        path: ".visp/features/001-example/assurance/T001/baseline-evidence.json",
        sha256: `sha256:${"d".repeat(64)}`
      },
      lockedAt: "2026-07-25T01:00:00.000Z"
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.lockHash).not.toBe(second.value.lockHash);
  });

  it("requires a current human approval for critical tasks", () => {
    const critical = plan("critical");
    expect(
      createOracleLock({ plan: critical, planPath, lockedAt: "2026-07-25T01:00:00.000Z" }).ok
    ).toBe(false);

    const approval = createOracleApproval({
      plan: critical,
      planPath,
      reviewerId: "reviewer-1",
      reason: "Critical behavior was reviewed.",
      approvedAt: "2026-07-25T00:00:00.000Z",
      expiresAt: "2026-07-26T00:00:00.000Z"
    });
    expect(approval.ok).toBe(true);
    if (!approval.ok) return;
    expect(
      createOracleLock({
        plan: critical,
        planPath,
        approval: approval.value,
        approvalPath,
        lockedAt: "2026-07-25T01:00:00.000Z"
      }).ok
    ).toBe(true);
    expect(
      createOracleLock({
        plan: critical,
        planPath,
        approval: approval.value,
        approvalPath,
        lockedAt: "2026-07-27T01:00:00.000Z",
        now: "2026-07-27T01:00:00.000Z"
      }).ok
    ).toBe(false);
  });

  it("rejects revoked approval and modified lock inputs", () => {
    const critical = plan("critical");
    const approval = createOracleApproval({
      plan: critical,
      planPath,
      reviewerId: "reviewer-1",
      reason: "Critical behavior was reviewed.",
      approvedAt: "2026-07-25T00:00:00.000Z"
    });
    expect(approval.ok).toBe(true);
    if (!approval.ok) return;
    const revoked = revokeOracleApproval({
      approval: approval.value,
      revokedAt: "2026-07-25T01:00:00.000Z",
      reason: "The approval is no longer valid."
    });
    expect(revoked.ok).toBe(true);
    if (!revoked.ok) return;
    expect(
      createOracleLock({
        plan: critical,
        planPath,
        approval: revoked.value,
        approvalPath,
        lockedAt: "2026-07-25T02:00:00.000Z"
      }).ok
    ).toBe(false);

    const lock = createOracleLock({
      plan: plan(),
      planPath,
      lockedAt: "2026-07-25T01:00:00.000Z"
    });
    expect(lock.ok).toBe(true);
    if (!lock.ok) return;
    expect(
      validateOracleLock({
        lock: lock.value,
        plan: { ...plan(), validationCommands: ["pnpm test --changed"] },
        planPath,
        now: "2026-07-25T01:00:00.000Z"
      }).ok
    ).toBe(false);
  });
});
