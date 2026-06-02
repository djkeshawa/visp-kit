import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  traceabilityStatusSchema
} from "./common.schema.js";

export const traceabilityEntrySchema = z
  .object({
    requirementId: idSchema,
    acceptanceCriterionIds: z.array(idSchema),
    planDecisionIds: z.array(idSchema).optional(),
    taskIds: z.array(idSchema),
    filePaths: z.array(pathStringSchema),
    testPaths: z.array(pathStringSchema),
    testRefs: z.array(nonEmptyStringSchema).optional(),
    status: traceabilityStatusSchema
  })
  .strict();

export const traceabilityMatrixSchema = z
  .object({
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema.optional(),
    entries: z.array(traceabilityEntrySchema),
    createdAt: isoDateTimeSchema.optional(),
    updatedAt: isoDateTimeSchema
  })
  .strict();

export type TraceabilityEntry = z.infer<typeof traceabilityEntrySchema>;
export type TraceabilityMatrix = z.infer<typeof traceabilityMatrixSchema>;
