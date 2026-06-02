import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  stringListSchema
} from "./common.schema.js";

export const reviewResultSchema = z.enum(["passed", "warnings", "failed"]);
export const reviewModeSchema = z.enum([
  "task",
  "feature",
  "diff-only",
  "prompt-only",
  "checklist-only"
]);
export const reviewFindingCategorySchema = z.enum([
  "scope",
  "traceability",
  "verification",
  "tests",
  "dependencies",
  "security/privacy",
  "risk",
  "documentation",
  "generated-files",
  "manual-review"
]);
export const reviewFindingSeveritySchema = z.enum(["info", "warning", "error"]);
export const reviewChangeTypeSchema = z.enum([
  "added",
  "modified",
  "deleted",
  "renamed",
  "copied",
  "unknown"
]);
export const reviewSectionStatusSchema = z.enum([
  "passed",
  "warnings",
  "failed",
  "missing",
  "skipped"
]);

export const reviewFindingSchema = z
  .object({
    id: idSchema,
    category: reviewFindingCategorySchema,
    severity: reviewFindingSeveritySchema,
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

export const reviewChangedFileSchema = z
  .object({
    path: pathStringSchema,
    changeType: reviewChangeTypeSchema,
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    inAllowedFiles: z.boolean(),
    inExpectedFiles: z.boolean(),
    inForbiddenFiles: z.boolean(),
    isDependencyFile: z.boolean(),
    isTestFile: z.boolean(),
    isGeneratedVispFile: z.boolean(),
    isBinary: z.boolean(),
    diffTruncated: z.boolean(),
    diff: z.string()
  })
  .strict();

export const reviewDiffSummarySchema = z
  .object({
    filesChanged: z.number().int().nonnegative(),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    truncatedFiles: z.number().int().nonnegative(),
    totalDiffTruncated: z.boolean(),
    diffSource: nonEmptyStringSchema,
    baseRef: nonEmptyStringSchema.nullable()
  })
  .strict();

export const reviewScopeSchema = z
  .object({
    status: reviewSectionStatusSchema,
    allowedFiles: z.array(pathStringSchema),
    expectedFiles: z.array(pathStringSchema),
    forbiddenFiles: z.array(pathStringSchema),
    outOfScopeFiles: z.array(pathStringSchema),
    forbiddenChangedFiles: z.array(pathStringSchema),
    unmappedChangedFiles: z.array(pathStringSchema),
    warnings: stringListSchema,
    errors: stringListSchema
  })
  .strict();

export const reviewTraceabilitySchema = z
  .object({
    status: reviewSectionStatusSchema,
    requirementIds: z.array(idSchema),
    acceptanceCriterionIds: z.array(idSchema),
    traceabilityFound: z.boolean(),
    warnings: stringListSchema,
    errors: stringListSchema
  })
  .strict();

export const reviewVerificationSchema = z
  .object({
    status: reviewSectionStatusSchema,
    reportPath: pathStringSchema.nullable(),
    verificationPassed: z.boolean().nullable(),
    verificationTaskId: idSchema.nullable(),
    warnings: stringListSchema,
    errors: stringListSchema
  })
  .strict();

export const reviewTestSchema = z
  .object({
    status: reviewSectionStatusSchema,
    testsChanged: z.boolean(),
    validationCommandsKnown: z.boolean(),
    behaviorChanging: z.boolean(),
    verificationCommandsPassed: z.boolean(),
    warnings: stringListSchema,
    errors: stringListSchema
  })
  .strict();

export const reviewDependencySchema = z
  .object({
    status: reviewSectionStatusSchema,
    changedDependencyFiles: z.array(pathStringSchema),
    approvedByTaskScope: z.boolean(),
    approvedByPlan: z.boolean(),
    warnings: stringListSchema,
    errors: stringListSchema
  })
  .strict();

export const securityChecklistItemSchema = z
  .object({
    id: idSchema,
    category: nonEmptyStringSchema,
    attention: z.enum(["standard", "high"]),
    text: nonEmptyStringSchema,
    reason: nonEmptyStringSchema
  })
  .strict();

export const reviewReportSchema = z
  .object({
    id: idSchema,
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema,
    taskId: idSchema.nullable(),
    mode: reviewModeSchema,
    startedAt: isoDateTimeSchema,
    endedAt: isoDateTimeSchema,
    durationMs: z.number().int().nonnegative(),
    success: z.boolean(),
    result: reviewResultSchema,
    changedFiles: z.array(reviewChangedFileSchema),
    diffSummary: reviewDiffSummarySchema,
    scopeReview: reviewScopeSchema,
    traceabilityReview: reviewTraceabilitySchema,
    verificationReview: reviewVerificationSchema,
    testReview: reviewTestSchema,
    dependencyReview: reviewDependencySchema,
    securityChecklist: z.array(securityChecklistItemSchema),
    findings: z.array(reviewFindingSchema),
    warnings: stringListSchema,
    errors: stringListSchema,
    promptPath: pathStringSchema.nullable(),
    reportPath: pathStringSchema.nullable(),
    checklistPath: pathStringSchema.nullable(),
    nextCommand: nonEmptyStringSchema
  })
  .strict();

export type ReviewResult = z.infer<typeof reviewResultSchema>;
export type ReviewMode = z.infer<typeof reviewModeSchema>;
export type ReviewFindingCategory = z.infer<typeof reviewFindingCategorySchema>;
export type ReviewFindingSeverity = z.infer<typeof reviewFindingSeveritySchema>;
export type ReviewChangedFile = z.infer<typeof reviewChangedFileSchema>;
export type ReviewFinding = z.infer<typeof reviewFindingSchema>;
export type ReviewReport = z.infer<typeof reviewReportSchema>;
export type SecurityChecklistItem = z.infer<typeof securityChecklistItemSchema>;
