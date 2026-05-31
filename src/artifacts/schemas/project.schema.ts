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
    currentState: z.literal("initialized"),
    lastCommand: z.literal("init"),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export type ProjectProfile = z.infer<typeof projectProfileSchema>;
export type ProjectConfig = z.infer<typeof projectConfigSchema>;
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
