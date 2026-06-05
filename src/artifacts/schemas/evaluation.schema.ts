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
    nextCommand: nonEmptyStringSchema
  })
  .strict();

export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
export type EvaluationCheck = z.infer<typeof evaluationCheckSchema>;
export type EvaluationReport = z.infer<typeof evaluationReportSchema>;
