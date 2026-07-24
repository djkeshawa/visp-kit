import { createHash } from "node:crypto";

import {
  oracleApprovalSchema,
  oracleLockSchema,
  type OracleApproval,
  type OracleLock
} from "../artifacts/schemas/oracle-authorization.schema.js";
import { type OraclePlan } from "../artifacts/schemas/oracle-plan.schema.js";
import { VispError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import { canonicalJsonV1 } from "../integration/canonical-json.js";

const oracleLockIdentityDomain = "visp.oracle-lock\0canonical-1.0\0";

type ApprovalInput = {
  readonly plan: OraclePlan;
  readonly planPath: string;
  readonly reviewerId: string;
  readonly reason: string;
  readonly approvedAt: string;
  readonly expiresAt?: string | null;
};

type LockInput = {
  readonly plan: OraclePlan;
  readonly planPath: string;
  readonly approval?: OracleApproval;
  readonly approvalPath?: string;
  readonly lockedAt: string;
  readonly now?: string;
};

function failure(message: string): Result<never, VispError> {
  return err(new VispError("VALIDATION_FAILED", message));
}

export function hashOracleValue(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalJsonV1(value), "utf8").digest("hex")}`;
}

export function hashOracleText(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function lockIdentity(lock: Omit<OracleLock, "lockHash" | "lockedAt">): `sha256:${string}` {
  const digest = createHash("sha256")
    .update(oracleLockIdentityDomain, "utf8")
    .update(canonicalJsonV1(lock), "utf8")
    .digest("hex");
  return `sha256:${digest}`;
}

export function createOracleApproval(input: ApprovalInput): Result<OracleApproval, VispError> {
  if (input.plan.assuranceProfile !== "critical") {
    return failure(`Task ${input.plan.taskId} does not require critical human approval.`);
  }

  const candidate = {
    version: "1.0" as const,
    taskId: input.plan.taskId,
    oraclePlan: {
      path: input.planPath,
      sha256: hashOracleValue(input.plan)
    },
    reviewerId: input.reviewerId,
    reason: input.reason,
    status: "approved" as const,
    approvedAt: input.approvedAt,
    expiresAt: input.expiresAt ?? null,
    revokedAt: null,
    revokedReason: null
  };
  const parsed = oracleApprovalSchema.safeParse(candidate);
  if (!parsed.success) {
    return failure(
      `Oracle approval is invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}.`
    );
  }
  if (
    parsed.data.expiresAt !== null &&
    Date.parse(parsed.data.expiresAt) <= Date.parse(parsed.data.approvedAt)
  ) {
    return failure("Oracle approval expiry must be later than its approval time.");
  }

  return ok(parsed.data);
}

export function revokeOracleApproval(input: {
  readonly approval: OracleApproval;
  readonly revokedAt: string;
  readonly reason: string;
}): Result<OracleApproval, VispError> {
  if (input.approval.status === "revoked") {
    return failure(`Oracle approval for task ${input.approval.taskId} is already revoked.`);
  }

  const parsed = oracleApprovalSchema.safeParse({
    ...input.approval,
    status: "revoked",
    revokedAt: input.revokedAt,
    revokedReason: input.reason
  });
  if (!parsed.success) {
    return failure(
      `Revoked oracle approval is invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}.`
    );
  }
  if (Date.parse(parsed.data.revokedAt ?? "") < Date.parse(parsed.data.approvedAt)) {
    return failure("Oracle approval cannot be revoked before it was approved.");
  }

  return ok(parsed.data);
}

export function validateOracleApproval(input: {
  readonly approval: OracleApproval;
  readonly plan: OraclePlan;
  readonly planPath: string;
  readonly now: string;
}): Result<OracleApproval, VispError> {
  const parsed = oracleApprovalSchema.safeParse(input.approval);
  if (!parsed.success) {
    return failure(
      `Oracle approval is invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}.`
    );
  }
  if (parsed.data.status !== "approved") {
    return failure(`Oracle approval for task ${input.plan.taskId} has been revoked.`);
  }
  if (
    parsed.data.taskId !== input.plan.taskId ||
    parsed.data.oraclePlan.path !== input.planPath ||
    parsed.data.oraclePlan.sha256 !== hashOracleValue(input.plan)
  ) {
    return failure(`Oracle approval for task ${input.plan.taskId} is stale or mismatched.`);
  }
  if (
    parsed.data.expiresAt !== null &&
    Date.parse(parsed.data.expiresAt) <= Date.parse(input.now)
  ) {
    return failure(`Oracle approval for task ${input.plan.taskId} has expired.`);
  }

  return ok(parsed.data);
}

export function createOracleLock(input: LockInput): Result<OracleLock, VispError> {
  let approvalBinding: OracleLock["approval"] = null;
  if (input.plan.assuranceProfile === "critical") {
    if (input.approval === undefined || input.approvalPath === undefined) {
      return failure(
        `Critical task ${input.plan.taskId} requires active human approval before locking.`
      );
    }
    const approval = validateOracleApproval({
      approval: input.approval,
      plan: input.plan,
      planPath: input.planPath,
      now: input.now ?? input.lockedAt
    });
    if (!approval.ok) return approval;
    approvalBinding = {
      path: input.approvalPath,
      sha256: hashOracleValue(approval.value)
    };
  }

  const material = {
    version: "1.0" as const,
    taskId: input.plan.taskId,
    assuranceProfile: input.plan.assuranceProfile,
    oraclePlan: {
      path: input.planPath,
      sha256: hashOracleValue(input.plan)
    },
    approval: approvalBinding,
    baseCommit: input.plan.baseCommit,
    bindings: input.plan.bindings,
    validationCommandsSha256: hashOracleValue(input.plan.validationCommands),
    testStrengthEvidenceSha256: hashOracleValue(input.plan.testStrengthEvidence)
  };
  const parsed = oracleLockSchema.safeParse({
    ...material,
    lockHash: lockIdentity(material),
    lockedAt: input.lockedAt
  });
  if (!parsed.success) {
    return failure(
      `Oracle lock is invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}.`
    );
  }

  return ok(parsed.data);
}

export function validateOracleLock(input: {
  readonly lock: OracleLock;
  readonly plan: OraclePlan;
  readonly planPath: string;
  readonly approval?: OracleApproval;
  readonly approvalPath?: string;
  readonly now: string;
}): Result<OracleLock, VispError> {
  const regenerated = createOracleLock({
    plan: input.plan,
    planPath: input.planPath,
    approval: input.approval,
    approvalPath: input.approvalPath,
    lockedAt: input.lock.lockedAt,
    now: input.now
  });
  if (!regenerated.ok) return regenerated;

  if (canonicalJsonV1(regenerated.value) !== canonicalJsonV1(input.lock)) {
    return failure(`Oracle lock for task ${input.plan.taskId} is stale or has been modified.`);
  }

  return ok(input.lock);
}
