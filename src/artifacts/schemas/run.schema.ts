import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  stringListSchema
} from "./common.schema.js";

export const runEventTypeSchema = z.enum([
  "command_started",
  "command_completed",
  "command_failed",
  "gate_evaluated",
  "artifact_written",
  "budget_estimated",
  "usage_recorded",
  "evidence_recorded",
  "override_applied"
]);

export const runEventSchema = z
  .object({
    id: idSchema,
    runId: idSchema,
    type: runEventTypeSchema,
    command: nonEmptyStringSchema,
    featureId: idSchema.optional(),
    featureSlug: nonEmptyStringSchema.optional(),
    taskId: idSchema.optional(),
    message: nonEmptyStringSchema,
    artifactPath: pathStringSchema.optional(),
    ruleId: idSchema.optional(),
    overrideId: idSchema.optional(),
    data: z.record(z.unknown()).optional(),
    createdAt: isoDateTimeSchema
  })
  .strict();

export const runArtifactSchema = z
  .object({
    id: idSchema,
    command: nonEmptyStringSchema,
    targetPath: pathStringSchema,
    featureId: idSchema.optional(),
    featureSlug: nonEmptyStringSchema.optional(),
    taskId: idSchema.optional(),
    startedAt: isoDateTimeSchema,
    endedAt: isoDateTimeSchema,
    durationMs: z.number().int().nonnegative(),
    success: z.boolean(),
    result: z.enum(["passed", "warnings", "failed"]),
    artifactWrites: z.array(pathStringSchema).default([]),
    estimatedTokens: z.number().int().nonnegative().optional(),
    actualTokens: z.number().int().nonnegative().optional(),
    warnings: stringListSchema,
    errors: stringListSchema,
    eventCount: z.number().int().nonnegative()
  })
  .strict();

export const runIndexEntrySchema = z
  .object({
    id: idSchema,
    command: nonEmptyStringSchema,
    featureId: idSchema.optional(),
    featureSlug: nonEmptyStringSchema.optional(),
    taskId: idSchema.optional(),
    startedAt: isoDateTimeSchema,
    endedAt: isoDateTimeSchema,
    success: z.boolean(),
    result: z.enum(["passed", "warnings", "failed"]),
    runPath: pathStringSchema
  })
  .strict();

export const runIndexSchema = z
  .object({
    latestRunId: idSchema.nullable(),
    runs: z.array(runIndexEntrySchema)
  })
  .strict();

export type RunEventType = z.infer<typeof runEventTypeSchema>;
export type RunEvent = z.infer<typeof runEventSchema>;
export type RunArtifact = z.infer<typeof runArtifactSchema>;
export type RunIndexEntry = z.infer<typeof runIndexEntrySchema>;
export type RunIndex = z.infer<typeof runIndexSchema>;
