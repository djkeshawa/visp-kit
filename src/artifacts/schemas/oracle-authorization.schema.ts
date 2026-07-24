import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema
} from "./common.schema.js";
import { assuranceProfileSchema } from "./evidence.schema.js";
import {
  oracleArtifactBindingSchema,
  oracleBaseCommitSchema,
  oracleSha256Schema
} from "./oracle-plan.schema.js";

export const oracleApprovalStatusSchema = z.enum(["approved", "revoked"]);

export const oracleApprovalSchema = z
  .object({
    version: z.literal("1.0"),
    taskId: idSchema,
    oraclePlan: oracleArtifactBindingSchema,
    reviewerId: nonEmptyStringSchema,
    reason: nonEmptyStringSchema.min(12),
    status: oracleApprovalStatusSchema,
    approvedAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema.nullable(),
    revokedAt: isoDateTimeSchema.nullable(),
    revokedReason: nonEmptyStringSchema.nullable()
  })
  .strict()
  .superRefine((approval, context) => {
    const revoked = approval.status === "revoked";
    if (
      revoked !== (approval.revokedAt !== null) ||
      revoked !== (approval.revokedReason !== null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message:
          "Revoked approvals require revokedAt and revokedReason; active approvals forbid them."
      });
    }
  });

export const oracleLockSchema = z
  .object({
    version: z.literal("1.0"),
    taskId: idSchema,
    assuranceProfile: assuranceProfileSchema,
    oraclePlan: oracleArtifactBindingSchema,
    approval: oracleArtifactBindingSchema.nullable(),
    baseCommit: oracleBaseCommitSchema,
    bindings: z
      .object({
        policy: oracleArtifactBindingSchema,
        specification: oracleArtifactBindingSchema,
        plan: oracleArtifactBindingSchema,
        taskGraph: oracleArtifactBindingSchema,
        context: oracleArtifactBindingSchema,
        task: z.object({ id: idSchema, sha256: oracleSha256Schema }).strict()
      })
      .strict(),
    validationCommandsSha256: oracleSha256Schema,
    testStrengthEvidenceSha256: oracleSha256Schema,
    lockHash: oracleSha256Schema,
    lockedAt: isoDateTimeSchema
  })
  .strict();

export const oracleAuthorizationBindingSchema = z
  .object({
    lockPath: pathStringSchema,
    lockHash: oracleSha256Schema,
    lockFileSha256: oracleSha256Schema
  })
  .strict();

export type OracleApprovalStatus = z.infer<typeof oracleApprovalStatusSchema>;
export type OracleApproval = z.infer<typeof oracleApprovalSchema>;
export type OracleLock = z.infer<typeof oracleLockSchema>;
export type OracleAuthorizationBinding = z.infer<typeof oracleAuthorizationBindingSchema>;
