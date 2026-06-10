import { z } from "zod";

import {
  idSchema,
  isoDateTimeSchema,
  pathStringSchema
} from "./common.schema.js";
import { strictnessModeSchema } from "./policy.schema.js";

export const implementMarkerSchema = z
  .object({
    version: z.literal("1.0"),
    taskId: idSchema,
    featureId: idSchema.nullable(),
    strictnessMode: strictnessModeSchema,
    allowedFiles: z.array(pathStringSchema),
    expectedFiles: z.array(pathStringSchema),
    forbiddenFiles: z.array(pathStringSchema),
    createdAt: isoDateTimeSchema
  })
  .strict();

export type ImplementMarker = z.infer<typeof implementMarkerSchema>;
