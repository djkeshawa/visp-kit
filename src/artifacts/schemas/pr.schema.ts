import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  stringListSchema
} from "./common.schema.js";
import { reviewChangeTypeSchema } from "./review.schema.js";

export const prStatusSchema = z.enum([
  "ready",
  "warnings",
  "blocked",
  "missing"
]);

export const prRequirementSchema = z
  .object({
    requirementId: idSchema,
    acceptanceCriterionIds: z.array(idSchema),
    status: prStatusSchema
  })
  .strict();

export const prTaskSchema = z
  .object({
    taskId: idSchema,
    title: nonEmptyStringSchema,
    status: nonEmptyStringSchema,
    evidence: stringListSchema
  })
  .strict();

export const prChangedFileSchema = z
  .object({
    path: pathStringSchema,
    changeType: reviewChangeTypeSchema,
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    notes: nonEmptyStringSchema
  })
  .strict();

export const prEvidenceSchema = z
  .object({
    status: prStatusSchema,
    reportPath: pathStringSchema.nullable(),
    summary: stringListSchema
  })
  .strict();

export const prArtifactSchema = z
  .object({
    success: z.boolean(),
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    summary: nonEmptyStringSchema,
    requirementsCovered: z.array(prRequirementSchema),
    tasksIncluded: z.array(prTaskSchema),
    changedFiles: z.array(prChangedFileSchema),
    validationEvidence: prEvidenceSchema,
    reviewEvidence: prEvidenceSchema,
    reconcileEvidence: prEvidenceSchema,
    risks: stringListSchema,
    rollback: stringListSchema,
    checklist: stringListSchema,
    followUps: stringListSchema,
    warnings: stringListSchema,
    errors: stringListSchema,
    generatedAt: isoDateTimeSchema
  })
  .strict();

export type PrArtifact = z.infer<typeof prArtifactSchema>;
export type PrStatus = z.infer<typeof prStatusSchema>;
