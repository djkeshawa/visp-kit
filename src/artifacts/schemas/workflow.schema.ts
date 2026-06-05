import { z } from "zod";

import {
  commandStringSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  stringListSchema
} from "./common.schema.js";
import { gateStageSchema } from "./gate.schema.js";

export const workflowStageNameSchema = z.enum([
  "setup",
  "scan",
  "constitution",
  "policy",
  "agent",
  "feature",
  "clarify",
  "spec",
  "plan",
  "tasks",
  "context",
  "implement",
  "verify",
  "review",
  "reconcile",
  "pr"
]);

export const workflowStageSchema = z
  .object({
    name: workflowStageNameSchema,
    purpose: nonEmptyStringSchema,
    command: commandStringSchema,
    gateStage: gateStageSchema.optional(),
    requiredArtifacts: z.array(pathStringSchema),
    generatedArtifacts: z.array(pathStringSchema),
    sourceEditsAllowed: z.boolean(),
    nextCommand: commandStringSchema,
    agentInstruction: nonEmptyStringSchema.optional()
  })
  .strict();

export const workflowManifestSchema = z
  .object({
    version: nonEmptyStringSchema,
    generatedAt: isoDateTimeSchema,
    stages: z.array(workflowStageSchema),
    principles: stringListSchema
  })
  .strict();

export type WorkflowStageName = z.infer<typeof workflowStageNameSchema>;
export type WorkflowStage = z.infer<typeof workflowStageSchema>;
export type WorkflowManifest = z.infer<typeof workflowManifestSchema>;
