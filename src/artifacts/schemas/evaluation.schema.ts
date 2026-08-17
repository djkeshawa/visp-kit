import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  stringListSchema
} from "./common.schema.js";

export const evaluationResultSchema = z.enum(["passed", "warnings", "failed"]);

export const evaluationCheckSchema = z
  .object({
    id: idSchema,
    category: z.enum([
      "workflow",
      "policy",
      "traceability",
      "context",
      "budget",
      "checklist",
      "evidence",
      "overrides",
      "pr",
      "schemas"
    ]),
    severity: z.enum(["info", "warning", "error"]),
    title: nonEmptyStringSchema,
    description: nonEmptyStringSchema,
    recommendation: nonEmptyStringSchema,
    file: pathStringSchema.nullable(),
    taskId: idSchema.optional()
  })
  .strict();

/**
 * One inspection eval could not run, and why.
 *
 * `checks` holds findings — problems — so an empty `checks` array meant "no
 * problems found" and was rendered as `Checks: 0`. Nothing distinguished that
 * from "nothing was inspected", and both printed `Result: passed`. LC-108.
 */
export const evaluationSkippedCheckSchema = z
  .object({
    inspection: nonEmptyStringSchema,
    reason: nonEmptyStringSchema
  })
  .strict();

/**
 * What the evaluation was actually able to look at. A `passed` verdict is only
 * worth something when at least one inspection ran; `empty` says it did not.
 */
export const evaluationCoverageSchema = z
  .object({
    description: nonEmptyStringSchema,
    checksPerformed: z.number().int().nonnegative(),
    performedChecks: stringListSchema,
    skippedChecks: z.array(evaluationSkippedCheckSchema),
    empty: z.boolean()
  })
  .strict();

export const benchmarkMetricsSchema = z
  .object({
    contextEfficiency: z
      .object({
        measuredTaskCount: z.number().int().nonnegative(),
        averageContextTokens: z.number().int().nonnegative(),
        wholeRepoTokenBaseline: z.number().int().nonnegative(),
        reductionRatio: z.number().min(0).max(1).nullable()
      })
      .strict(),
    evidenceCompleteness: z
      .object({
        presentArtifacts: z.number().int().nonnegative(),
        expectedArtifacts: z.number().int().positive(),
        ratio: z.number().min(0).max(1)
      })
      .strict(),
    artifactValidation: z
      .object({
        parsedArtifacts: z.number().int().nonnegative(),
        presentArtifacts: z.number().int().nonnegative(),
        ratio: z.number().min(0).max(1).nullable()
      })
      .strict(),
    drift: z
      .object({
        errors: z.number().int().nonnegative(),
        warnings: z.number().int().nonnegative()
      })
      .strict()
      .nullable()
  })
  .strict();

export const evaluationReportSchema = z
  .object({
    success: z.boolean(),
    targetPath: pathStringSchema,
    featureId: idSchema.nullable(),
    featureSlug: nonEmptyStringSchema.nullable(),
    taskId: idSchema.nullable(),
    result: evaluationResultSchema,
    generatedAt: isoDateTimeSchema,
    checks: z.array(evaluationCheckSchema),
    warnings: stringListSchema,
    errors: stringListSchema,
    reportPath: pathStringSchema.nullable(),
    jsonPath: pathStringSchema.nullable(),
    /**
     * Optional so evaluation reports written before coverage existed keep
     * validating. Every report this version writes carries it.
     */
    coverage: evaluationCoverageSchema.optional(),
    nextCommand: nonEmptyStringSchema,
    // Optional so evaluation reports written before benchmarking existed keep
    // validating; populated only when eval runs with --benchmark.
    metrics: benchmarkMetricsSchema.optional()
  })
  .strict();

export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
export type EvaluationCheck = z.infer<typeof evaluationCheckSchema>;
export type EvaluationSkippedCheck = z.infer<typeof evaluationSkippedCheckSchema>;
export type EvaluationCoverage = z.infer<typeof evaluationCoverageSchema>;
export type BenchmarkMetrics = z.infer<typeof benchmarkMetricsSchema>;
export type EvaluationReport = z.infer<typeof evaluationReportSchema>;
