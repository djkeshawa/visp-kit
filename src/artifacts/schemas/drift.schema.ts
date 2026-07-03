import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  stringListSchema
} from "./common.schema.js";
import { strictnessModeSchema } from "./policy.schema.js";

export const driftKindSchema = z.enum([
  "stale_context_provenance",
  "code_changed_after_context",
  "scope_path_missing",
  "mapped_test_missing",
  "spec_edited_after_tasks",
  "marker_task_mismatch",
  "evidence_predates_change"
]);

export const driftSeveritySchema = z.enum(["info", "warning", "error"]);

export const driftFindingSchema = z
  .object({
    id: idSchema,
    kind: driftKindSchema,
    severity: driftSeveritySchema,
    taskId: idSchema.nullable(),
    file: pathStringSchema.nullable(),
    expectedHash: nonEmptyStringSchema.nullable(),
    actualHash: nonEmptyStringSchema.nullable(),
    evidence: nonEmptyStringSchema,
    recommendation: nonEmptyStringSchema
  })
  .strict();

export const driftResultSchema = z.enum(["passed", "warnings", "failed"]);

export const driftSummarySchema = z
  .object({
    stale_context_provenance: z.number().int().nonnegative(),
    code_changed_after_context: z.number().int().nonnegative(),
    scope_path_missing: z.number().int().nonnegative(),
    mapped_test_missing: z.number().int().nonnegative(),
    spec_edited_after_tasks: z.number().int().nonnegative(),
    marker_task_mismatch: z.number().int().nonnegative(),
    evidence_predates_change: z.number().int().nonnegative()
  })
  .strict();

export const driftReportSchema = z
  .object({
    success: z.boolean(),
    targetPath: pathStringSchema,
    featureId: idSchema.nullable(),
    featureSlug: nonEmptyStringSchema.nullable(),
    generatedAt: isoDateTimeSchema,
    strictnessMode: strictnessModeSchema,
    result: driftResultSchema,
    findings: z.array(driftFindingSchema),
    summary: driftSummarySchema,
    warnings: stringListSchema,
    errors: stringListSchema,
    reportPath: pathStringSchema.nullable(),
    jsonPath: pathStringSchema.nullable(),
    nextCommand: nonEmptyStringSchema
  })
  .strict();

export type DriftKind = z.infer<typeof driftKindSchema>;
export type DriftSeverity = z.infer<typeof driftSeveritySchema>;
export type DriftFinding = z.infer<typeof driftFindingSchema>;
export type DriftResult = z.infer<typeof driftResultSchema>;
export type DriftSummary = z.infer<typeof driftSummarySchema>;
export type DriftReport = z.infer<typeof driftReportSchema>;
