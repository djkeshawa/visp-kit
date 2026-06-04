import { z } from "zod";

import { isoDateTimeSchema } from "./common.schema.js";
import { strictnessModeSchema } from "./policy.schema.js";

export const agentTargetNameSchema = z.enum([
  "codex",
  "generic",
  "claude",
  "copilot"
]);

export const installedAgentTargetSchema = z
  .object({
    target: agentTargetNameSchema,
    strictnessMode: strictnessModeSchema,
    installedAt: isoDateTimeSchema,
    refreshedAt: isoDateTimeSchema,
    files: z.array(z.string().min(1)),
    version: z.string().min(1).optional(),
    warnings: z.array(z.string()).default([])
  })
  .strict();

export const installedAgentTargetsSchema = z
  .object({
    installedTargets: z.array(installedAgentTargetSchema)
  })
  .strict();

export const agentWorkflowMapItemSchema = z
  .object({
    target: agentTargetNameSchema,
    name: z.string().min(1),
    purpose: z.string().min(1),
    entrypointFile: z.string().min(1),
    requiredVispCommands: z.array(z.string().min(1)),
    hardStops: z.array(z.string().min(1)),
    nextRecommendedCommand: z.string().min(1)
  })
  .strict();

export const agentWorkflowMapSchema = z
  .object({
    workflows: z.array(agentWorkflowMapItemSchema)
  })
  .strict();

export type AgentTargetName = z.infer<typeof agentTargetNameSchema>;
export type InstalledAgentTarget = z.infer<typeof installedAgentTargetSchema>;
export type InstalledAgentTargets = z.infer<typeof installedAgentTargetsSchema>;
export type AgentWorkflowMapItem = z.infer<typeof agentWorkflowMapItemSchema>;
export type AgentWorkflowMap = z.infer<typeof agentWorkflowMapSchema>;
