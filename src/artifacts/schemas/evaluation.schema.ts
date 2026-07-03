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
    nextCommand: nonEmptyStringSchema,
    // Optional so evaluation reports written before benchmarking existed keep
    // validating; populated only when eval runs with --benchmark.
    metrics: benchmarkMetricsSchema.optional()
  })
  .strict();

export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
export type EvaluationCheck = z.infer<typeof evaluationCheckSchema>;
export type BenchmarkMetrics = z.infer<typeof benchmarkMetricsSchema>;
export type EvaluationReport = z.infer<typeof evaluationReportSchema>;
