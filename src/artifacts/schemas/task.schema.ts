import { z } from "zod";

import {
  commandStringSchema,
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  approvalClassSchema,
  blastRadiusSchema,
  reversibilitySchema,
  riskFactorsSchema,
  riskLevelSchema,
  taskClassSchema,
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
    riskLevel: riskLevelSchema,
    taskClass: taskClassSchema.optional(),
    riskFactors: riskFactorsSchema.optional(),
    /**
     * P8-05. All three are optional and additive: a task graph written before
     * this change stays valid, and `deriveApprovalClass` treats an absent
     * declaration as the conservative default rather than as permission.
     */
    reversibility: reversibilitySchema.optional(),
    blastRadius: blastRadiusSchema.optional(),
    approvalClass: approvalClassSchema.optional()
  })
  .strict();

export const taskGraphArtifactSchema = z
  .object({
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema.optional(),
    status: z.enum(["draft_invalid", "draft", "ready"]).optional(),
    tasks: z.array(taskSchema),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export type Task = z.infer<typeof taskSchema>;
export type TaskGraphArtifact = z.infer<typeof taskGraphArtifactSchema>;
