import { z } from "zod";

import {
  agentModeSchema,
  budgetModeSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  packageManagerSchema,
  pathStringSchema,
  presetSchema,
  stringListSchema
} from "./common.schema.js";

export const projectWorkflowStateSchema = z.enum([
  "initialized",
  "feature_intent_ready"
]);

export const projectLastCommandSchema = z.enum(["init", "feature"]);

export const projectProfileSchema = z
  .object({
    name: nonEmptyStringSchema,
    rootPath: pathStringSchema,
    packageManager: packageManagerSchema,
    languages: stringListSchema,
    frameworks: stringListSchema,
    testFrameworks: stringListSchema,
    buildCommands: stringListSchema,
    testCommands: stringListSchema,
    lintCommands: stringListSchema,
    typecheckCommands: stringListSchema,
    sourceRoots: stringListSchema,
    testRoots: stringListSchema,
    ignoredPaths: stringListSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export const projectConfigSchema = z
  .object({
    schemaVersion: nonEmptyStringSchema,
    projectId: nonEmptyStringSchema,
    budgetMode: budgetModeSchema,
    preset: presetSchema,
    agent: agentModeSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export const projectStatusSchema = z
  .object({
    initialized: z.literal(true),
    activeFeatureId: nonEmptyStringSchema.nullable(),
    activeFeatureSlug: nonEmptyStringSchema.nullable().optional(),
    activeFeaturePath: pathStringSchema.nullable().optional(),
    currentState: projectWorkflowStateSchema,
    lastCommand: projectLastCommandSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export type ProjectProfile = z.infer<typeof projectProfileSchema>;
export type ProjectConfig = z.infer<typeof projectConfigSchema>;
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type ProjectWorkflowState = z.infer<typeof projectWorkflowStateSchema>;
export type ProjectLastCommand = z.infer<typeof projectLastCommandSchema>;
