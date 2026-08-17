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

/**
 * What the task's current status was decided on.
 *
 * LC-130: `done` writes a durable `verified` into the task graph, and the task
 * record carried no trace of what that verdict rested on. A review that saw one
 * comment line in a file the task never expected to change produced the same
 * `verified` as a review of the whole deliverable, and nothing downstream could
 * tell them apart. A status with no basis is the shape LC-106 existed to kill,
 * one artifact further along.
 */
export const taskStatusBasisSchema = z
  .object({
    status: taskStatusSchema,
    recordedAt: isoDateTimeSchema,
    review: z
      .object({
        result: z.enum(["passed", "warnings", "failed"]),
        basis: nonEmptyStringSchema,
        filesExamined: z.number().int().nonnegative(),
        reviewableFiles: z.number().int().nonnegative(),
        reviewedExpectedFiles: z.array(pathStringSchema)
      })
      .strict()
      .nullable(),
    verificationPassed: z.boolean()
  })
  .strict();

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
    approvalClass: approvalClassSchema.optional(),
    /**
     * Optional so task graphs written before LC-130 stay valid, and so a task
     * whose status has never been moved by the workflow carries none.
     */
    statusBasis: taskStatusBasisSchema.optional()
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

export type TaskStatusBasis = z.infer<typeof taskStatusBasisSchema>;
export type Task = z.infer<typeof taskSchema>;
export type TaskGraphArtifact = z.infer<typeof taskGraphArtifactSchema>;
