import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  pathStringSchema,
  traceabilityStatusSchema
} from "./common.schema.js";

export const traceabilityEntrySchema = z
  .object({
    requirementId: idSchema,
    acceptanceCriterionIds: z.array(idSchema),
    taskIds: z.array(idSchema),
    filePaths: z.array(pathStringSchema),
    testPaths: z.array(pathStringSchema),
    status: traceabilityStatusSchema
  })
  .strict();

export const traceabilityMatrixSchema = z
  .object({
    featureId: idSchema,
    entries: z.array(traceabilityEntrySchema),
    updatedAt: isoDateTimeSchema
  })
  .strict();

export type TraceabilityEntry = z.infer<typeof traceabilityEntrySchema>;
export type TraceabilityMatrix = z.infer<typeof traceabilityMatrixSchema>;
