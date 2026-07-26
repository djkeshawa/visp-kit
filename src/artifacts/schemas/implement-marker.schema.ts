import { z } from "zod";

import { idSchema, isoDateTimeSchema, pathStringSchema } from "./common.schema.js";
import { oracleAuthorizationBindingSchema } from "./oracle-authorization.schema.js";
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
    oracleAuthorization: oracleAuthorizationBindingSchema.optional(),
    /**
     * Files already modified in the working tree when implementation was
     * authorized for this task.
     *
     * Scope is diffed against the feature's base commit, not against the moment
     * the task started, so work left uncommitted by an earlier task is reported
     * as if this task had changed it. Recording the starting state lets review
     * name those files as pre-existing instead of accusing the current task.
     *
     * Optional so markers written before this field remain valid; absent means
     * the starting state was not captured, not that the tree was clean.
     */
    preExistingChangedFiles: z.array(pathStringSchema).optional(),
    createdAt: isoDateTimeSchema
  })
  .strict();

export type ImplementMarker = z.infer<typeof implementMarkerSchema>;
