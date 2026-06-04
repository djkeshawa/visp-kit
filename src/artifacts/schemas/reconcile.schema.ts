import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  stringListSchema
} from "./common.schema.js";
import { policyGateSummarySchema } from "./gate.schema.js";
import { reviewChangeTypeSchema } from "./review.schema.js";

export const reconcileResultSchema = z.enum(["passed", "warnings", "failed"]);
export const reconcileModeSchema = z.enum(["task", "feature", "prompt-only"]);
export const reconcileSeveritySchema = z.enum(["info", "warning", "error"]);
export const driftTypeSchema = z.enum([
  "unmapped_file_change",
  "unmapped_requirement",
  "unmapped_acceptance_criterion",
  "task_without_requirement",
  "task_without_acceptance_criterion",
  "changed_forbidden_file",
  "dependency_change_without_approval",
  "verification_missing",
  "verification_failed",
  "review_missing",
  "review_failed",
  "spec_behavior_gap",
  "plan_mismatch",
  "traceability_missing_or_stale",
  "manual_review_needed",
  "evidence_found"
]);
export const reconcileCategorySchema = z.enum([
  "task-alignment",
  "requirement-coverage",
  "file-mapping",
  "verification",
  "review",
  "dependencies",
  "traceability",
  "follow-up"
]);
export const mappingStatusSchema = z.enum([
  "mapped",
  "unmapped",
  "forbidden",
  "generated",
  "dependency"
]);

export const reconcileFindingSchema = z
  .object({
    id: idSchema,
    category: reconcileCategorySchema,
    severity: reconcileSeveritySchema,
    driftType: driftTypeSchema,
    title: nonEmptyStringSchema,
    description: nonEmptyStringSchema,
    file: pathStringSchema.nullable(),
    evidence: nonEmptyStringSchema,
    recommendation: nonEmptyStringSchema,
    relatedTaskId: idSchema.nullable(),
    relatedRequirementIds: z.array(idSchema),
    relatedAcceptanceCriterionIds: z.array(idSchema)
  })
  .strict();

export const reconcileChangedFileSchema = z
  .object({
    path: pathStringSchema,
    changeType: reviewChangeTypeSchema,
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    mappingStatus: mappingStatusSchema,
    isTestFile: z.boolean(),
    isDependencyFile: z.boolean(),
    isVispGeneratedFile: z.boolean(),
    isAllowedByTask: z.boolean(),
    isExpectedByTask: z.boolean(),
    isForbiddenByTask: z.boolean(),
    relatedTaskIds: z.array(idSchema),
    relatedRequirementIds: z.array(idSchema),
    relatedAcceptanceCriterionIds: z.array(idSchema),
    notes: stringListSchema
  })
  .strict();

export const reconcileTaskAlignmentSchema = z
  .object({
    status: reconcileResultSchema,
    taskExists: z.boolean(),
    requirementLinks: z.array(idSchema),
    acceptanceCriterionLinks: z.array(idSchema),
    changedFilesInScope: z.boolean(),
    forbiddenFilesChanged: z.array(pathStringSchema),
    validationEvidenceFound: z.boolean(),
    contextPackFound: z.boolean(),
    warnings: stringListSchema,
    errors: stringListSchema
  })
  .strict();

export const requirementCoverageItemSchema = z
  .object({
    requirementId: idSchema,
    acceptanceCriterionIds: z.array(idSchema),
    taskIds: z.array(idSchema),
    filePaths: z.array(pathStringSchema),
    status: reconcileResultSchema
  })
  .strict();

export const reconcileRequirementCoverageSchema = z
  .object({
    status: reconcileResultSchema,
    items: z.array(requirementCoverageItemSchema),
    warnings: stringListSchema,
    errors: stringListSchema
  })
  .strict();

export const reconcileFileMappingSchema = z
  .object({
    status: reconcileResultSchema,
    mappedFiles: z.array(pathStringSchema),
    unmappedFiles: z.array(pathStringSchema),
    forbiddenFiles: z.array(pathStringSchema),
    dependencyFiles: z.array(pathStringSchema),
    generatedFiles: z.array(pathStringSchema),
    warnings: stringListSchema,
    errors: stringListSchema
  })
  .strict();

export const reconcileEvidenceSchema = z
  .object({
    status: reconcileResultSchema,
    reportPath: pathStringSchema.nullable(),
    found: z.boolean(),
    passed: z.boolean().nullable(),
    result: nonEmptyStringSchema.nullable(),
    warnings: stringListSchema,
    errors: stringListSchema,
    summary: stringListSchema
  })
  .strict();

export const reconcileDependencyEvidenceSchema = z
  .object({
    status: reconcileResultSchema,
    changedDependencyFiles: z.array(pathStringSchema),
    approvedByTaskScope: z.boolean(),
    approvedByPlan: z.boolean(),
    warnings: stringListSchema,
    errors: stringListSchema
  })
  .strict();

export const traceabilityUpdateSchema = z
  .object({
    requested: z.boolean(),
    performed: z.boolean(),
    updatedFiles: z.array(pathStringSchema),
    skippedReason: nonEmptyStringSchema.nullable()
  })
  .strict();

export const reconcileReportSchema = z
  .object({
    id: idSchema,
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema,
    taskId: idSchema.nullable(),
    mode: reconcileModeSchema,
    startedAt: isoDateTimeSchema,
    endedAt: isoDateTimeSchema,
    durationMs: z.number().int().nonnegative(),
    success: z.boolean(),
    result: reconcileResultSchema,
    changedFiles: z.array(reconcileChangedFileSchema),
    taskAlignment: reconcileTaskAlignmentSchema,
    requirementCoverage: reconcileRequirementCoverageSchema,
    fileMapping: reconcileFileMappingSchema,
    verificationEvidence: reconcileEvidenceSchema,
    reviewEvidence: reconcileEvidenceSchema,
    dependencyEvidence: reconcileDependencyEvidenceSchema,
    policyGate: policyGateSummarySchema.optional(),
    traceabilityUpdate: traceabilityUpdateSchema,
    findings: z.array(reconcileFindingSchema),
    followUpSuggestions: stringListSchema,
    warnings: stringListSchema,
    errors: stringListSchema,
    reportPath: pathStringSchema.nullable(),
    promptPath: pathStringSchema.nullable(),
    nextCommand: nonEmptyStringSchema
  })
  .strict();

export type ReconcileResult = z.infer<typeof reconcileResultSchema>;
export type DriftType = z.infer<typeof driftTypeSchema>;
export type ReconcileFinding = z.infer<typeof reconcileFindingSchema>;
export type ReconcileChangedFile = z.infer<typeof reconcileChangedFileSchema>;
export type ReconcileReport = z.infer<typeof reconcileReportSchema>;
export type TraceabilityUpdate = z.infer<typeof traceabilityUpdateSchema>;
