import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema
} from "./common.schema.js";
import { evidenceProviderIdentitySchema, evidenceStatusSchema } from "./evidence.schema.js";
import {
  oracleArtifactBindingSchema,
  oracleBaseCommitSchema,
  oracleSha256Schema
} from "./oracle-plan.schema.js";
import { evidenceProviderRunSchema } from "./provider-run.schema.js";
import { verificationCommandResultSchema } from "./verification.schema.js";

const hashedPathSchema = z
  .object({
    path: pathStringSchema,
    sha256: oracleSha256Schema
  })
  .strict();

export const baselineCacheKeySchema = z
  .object({
    version: z.literal("1.0"),
    hash: oracleSha256Schema,
    baseCommit: oracleBaseCommitSchema,
    commandSetSha256: oracleSha256Schema,
    lockfiles: z.array(hashedPathSchema),
    configurations: z.array(hashedPathSchema),
    providers: z.array(evidenceProviderIdentitySchema),
    runtimes: z.array(
      z
        .object({
          id: idSchema,
          major: z.number().int().nonnegative()
        })
        .strict()
    ),
    platform: nonEmptyStringSchema,
    architecture: nonEmptyStringSchema
  })
  .strict();

export const baselineOracleResultSchema = z
  .object({
    oracleId: idSchema,
    expected: z.enum(["passed", "failed", "recorded"]),
    observed: z.enum(["passed", "failed", "inconclusive"]),
    expectationMet: z.boolean()
  })
  .strict();

export const baselineEvidenceSchema = z
  .object({
    version: z.literal("1.0"),
    id: idSchema,
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema,
    taskId: idSchema,
    oraclePlan: oracleArtifactBindingSchema,
    originLockHash: oracleSha256Schema,
    cacheKey: baselineCacheKeySchema,
    oracles: z.array(baselineOracleResultSchema),
    providerRuns: z.array(evidenceProviderRunSchema).default([]),
    commands: z.array(verificationCommandResultSchema),
    outcome: evidenceStatusSchema,
    generatedAt: isoDateTimeSchema
  })
  .strict();

export type BaselineCacheKey = z.infer<typeof baselineCacheKeySchema>;
export type BaselineOracleResult = z.infer<typeof baselineOracleResultSchema>;
export type BaselineEvidence = z.infer<typeof baselineEvidenceSchema>;
