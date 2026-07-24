import { z } from "zod";

import { idSchema, isoDateTimeSchema, nonEmptyStringSchema } from "./common.schema.js";
import { evidenceStatusSchema } from "./evidence.schema.js";
import { oracleAuthorizationBindingSchema } from "./oracle-authorization.schema.js";
import { oracleArtifactBindingSchema, oracleSha256Schema } from "./oracle-plan.schema.js";
import { verificationCommandResultSchema } from "./verification.schema.js";

const observedStatusSchema = z.enum(["passed", "failed", "inconclusive"]);

export const candidateOracleComparisonSchema = z
  .object({
    oracleId: idSchema,
    baseline: z
      .object({
        expected: z.enum(["passed", "failed", "recorded"]),
        observed: observedStatusSchema,
        expectationMet: z.boolean()
      })
      .strict(),
    candidate: z
      .object({
        expected: z.literal("passed"),
        observed: observedStatusSchema,
        expectationMet: z.boolean()
      })
      .strict(),
    outcome: evidenceStatusSchema
  })
  .strict();

export const candidateEvidenceSchema = z
  .object({
    version: z.literal("1.0"),
    id: idSchema,
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema,
    taskId: idSchema,
    oraclePlan: oracleArtifactBindingSchema,
    oracleAuthorization: oracleAuthorizationBindingSchema,
    baselineEvidence: oracleArtifactBindingSchema,
    baselineCacheKeySha256: oracleSha256Schema,
    oracles: z.array(candidateOracleComparisonSchema),
    commands: z.array(verificationCommandResultSchema),
    outcome: evidenceStatusSchema,
    generatedAt: isoDateTimeSchema
  })
  .strict()
  .superRefine((evidence, context) => {
    if (
      new Set(evidence.oracles.map((oracle) => oracle.oracleId)).size !== evidence.oracles.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["oracles"],
        message: "Candidate oracle IDs must be unique."
      });
    }
  });

export type CandidateOracleComparison = z.infer<typeof candidateOracleComparisonSchema>;
export type CandidateEvidence = z.infer<typeof candidateEvidenceSchema>;
