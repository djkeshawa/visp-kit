import { z } from "zod";

import {
  commandStringSchema,
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  riskLevelSchema,
  taskStatusSchema
} from "./common.schema.js";

export const taskSchema = z
  .object({
    id: idSchema,
    title: nonEmptyStringSchema,
    description: nonEmptyStringSchema,
    requirementIds: z.array(idSchema),
    acceptanceCriterionIds: z.array(idSchema),
    dependsOn: z.array(idSchema),
    allowedFiles: z.array(pathStringSchema),
    expectedFiles: z.array(pathStringSchema).optional(),
    forbiddenFiles: z.array(pathStringSchema).optional(),
    validationCommands: z.array(commandStringSchema),
    status: taskStatusSchema,
    parallelizable: z.boolean(),
    riskLevel: riskLevelSchema
  })
  .strict();

export const taskGraphArtifactSchema = z
  .object({
    featureId: idSchema,
    tasks: z.array(taskSchema),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export type Task = z.infer<typeof taskSchema>;
export type TaskGraphArtifact = z.infer<typeof taskGraphArtifactSchema>;
