import { z } from "zod";
import { z as z4 } from "zod/v4";

import {
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema
} from "./common.schema.js";

const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);

export const assuranceProfileValues = ["routine", "behavioral", "critical"] as const;
export const assuranceProfileSchema = z.enum(assuranceProfileValues);
export const assuranceProfileSchemaV4 = z4.enum(assuranceProfileValues);

export const evidenceStatusSchema = z.enum(["passed", "failed", "inconclusive", "not_applicable"]);

export const evidenceProviderIdentitySchema = z
  .object({
    id: idSchema,
    version: nonEmptyStringSchema
  })
  .strict();

export const evidenceTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("command"), command: nonEmptyStringSchema }).strict(),
  z.object({ kind: z.literal("validation_oracle"), oracleId: idSchema }).strict(),
  z.object({ kind: z.literal("static_check"), checkId: idSchema }).strict(),
  z.object({ kind: z.literal("security_check"), checkId: idSchema }).strict(),
  z.object({ kind: z.literal("human_review"), reviewId: idSchema }).strict()
]);

export const evidenceRequirementSchema = z
  .object({
    version: z.literal("1.0"),
    id: idSchema,
    providerId: idSchema,
    target: evidenceTargetSchema,
    freshnessRule: nonEmptyStringSchema,
    independenceRule: nonEmptyStringSchema,
    requiredVerdict: z.literal("passed")
  })
  .strict();

const nonEmptyStringSchemaV4 = z4.string().min(1);
const idSchemaV4 = nonEmptyStringSchemaV4.regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);

export const evidenceTargetSchemaV4 = z4.discriminatedUnion("kind", [
  z4.object({ kind: z4.literal("command"), command: nonEmptyStringSchemaV4 }).strict(),
  z4.object({ kind: z4.literal("validation_oracle"), oracleId: idSchemaV4 }).strict(),
  z4.object({ kind: z4.literal("static_check"), checkId: idSchemaV4 }).strict(),
  z4.object({ kind: z4.literal("security_check"), checkId: idSchemaV4 }).strict(),
  z4.object({ kind: z4.literal("human_review"), reviewId: idSchemaV4 }).strict()
]);

export const evidenceRequirementSchemaV4 = z4
  .object({
    version: z4.literal("1.0"),
    id: idSchemaV4,
    providerId: idSchemaV4,
    target: evidenceTargetSchemaV4,
    freshnessRule: nonEmptyStringSchemaV4,
    independenceRule: nonEmptyStringSchemaV4,
    requiredVerdict: z4.literal("passed")
  })
  .strict();

const evidenceInputHashSchema = z
  .object({
    id: idSchema,
    sha256: sha256Schema
  })
  .strict();

const evidenceOperationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("command"),
      executable: nonEmptyStringSchema,
      args: z.array(z.string()),
      cwd: pathStringSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal("inspection"),
      inspector: nonEmptyStringSchema,
      subject: nonEmptyStringSchema
    })
    .strict()
]);

const freshnessProofSchema = {
  checkedAt: isoDateTimeSchema,
  inputHashes: z.array(evidenceInputHashSchema)
};

const evidenceFreshnessSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("fresh"),
      ...freshnessProofSchema
    })
    .strict(),
  z
    .object({
      status: z.literal("stale"),
      ...freshnessProofSchema,
      reason: nonEmptyStringSchema
    })
    .strict(),
  z
    .object({
      status: z.literal("unknown"),
      ...freshnessProofSchema,
      reason: nonEmptyStringSchema
    })
    .strict()
]);

const evidenceOutputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("captured"),
      stdout: z.string(),
      stderr: z.string(),
      truncated: z.boolean()
    })
    .strict(),
  z
    .object({
      kind: z.literal("reference"),
      reference: nonEmptyStringSchema,
      sha256: sha256Schema
    })
    .strict(),
  z
    .object({
      kind: z.literal("none"),
      reason: nonEmptyStringSchema
    })
    .strict()
]);

const notApplicableDeterminationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rule"), ruleId: idSchema }).strict(),
  z.object({ kind: z.literal("override"), overrideId: idSchema }).strict()
]);

const evidenceOutcomeSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("passed") }).strict(),
  z
    .object({
      status: z.literal("failed"),
      reason: nonEmptyStringSchema
    })
    .strict(),
  z
    .object({
      status: z.literal("inconclusive"),
      reason: nonEmptyStringSchema
    })
    .strict(),
  z
    .object({
      status: z.literal("not_applicable"),
      reason: nonEmptyStringSchema,
      determination: notApplicableDeterminationSchema
    })
    .strict()
]);

export const evidenceResultSchema = z
  .object({
    version: z.literal("1.0"),
    id: idSchema,
    requirementId: idSchema,
    provider: evidenceProviderIdentitySchema,
    target: evidenceTargetSchema,
    operation: evidenceOperationSchema,
    inputHashes: z.array(evidenceInputHashSchema),
    startedAt: isoDateTimeSchema,
    endedAt: isoDateTimeSchema,
    freshness: evidenceFreshnessSchema,
    independence: z.enum([
      "pre_existing",
      "pre_approved",
      "implementer_authored",
      "independent_challenger",
      "human_attestation"
    ]),
    output: evidenceOutputSchema,
    outcome: evidenceOutcomeSchema
  })
  .strict()
  .superRefine((result, context) => {
    if (Date.parse(result.endedAt) < Date.parse(result.startedAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endedAt"],
        message: "endedAt must not precede startedAt"
      });
    }
  });

export type AssuranceProfile = z.infer<typeof assuranceProfileSchema>;
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;
export type EvidenceProviderIdentity = z.infer<typeof evidenceProviderIdentitySchema>;
export type EvidenceTarget = z.infer<typeof evidenceTargetSchema>;
export type EvidenceRequirement = z.infer<typeof evidenceRequirementSchema>;
export type EvidenceResult = z.infer<typeof evidenceResultSchema>;
