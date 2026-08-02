import { z } from "zod";

import { isoDateTimeSchema } from "./common.schema.js";
import { strictnessModeSchema } from "./policy.schema.js";

export const agentTargetNameSchema = z.enum([
  "codex",
  "generic",
  "claude",
  "copilot",
  "cursor",
  "gemini",
  "opencode"
]);

export const installedAgentTargetSchema = z
  .object({
    target: agentTargetNameSchema,
    strictnessMode: strictnessModeSchema,
    installedAt: isoDateTimeSchema,
    refreshedAt: isoDateTimeSchema,
    files: z.array(z.string().min(1)),
    // D-118 decision 4: sha256 of each file's bytes as generated, keyed by
    // relative path. Lets a later install distinguish "user never touched
    // this" (regenerate silently) from "user modified it" (refuse, report).
    fileHashes: z.record(z.string().min(1), z.string().regex(/^sha256:[a-f0-9]{64}$/u)).optional(),
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

export const agentCapabilitySchema = z
  .object({
    target: agentTargetNameSchema,
    supportsSkillFiles: z.boolean(),
    supportsCommandFiles: z.boolean(),
    supportsRepositoryInstructions: z.boolean(),
    canRunShellExpected: z.boolean(),
    canEditFilesExpected: z.boolean(),
    tokenUsageVisibility: z.enum(["manual", "reported", "unknown"]),
    recommendedWorkflowTriggers: z.array(z.string().min(1)),
    generatedFiles: z.array(z.string().min(1)),
    limitations: z.array(z.string())
  })
  .strict();

export const agentCapabilitiesSchema = z
  .object({
    generatedAt: isoDateTimeSchema,
    capabilities: z.array(agentCapabilitySchema)
  })
  .strict();

export type AgentTargetName = z.infer<typeof agentTargetNameSchema>;
export type InstalledAgentTarget = z.infer<typeof installedAgentTargetSchema>;
export type InstalledAgentTargets = z.infer<typeof installedAgentTargetsSchema>;
export type AgentWorkflowMapItem = z.infer<typeof agentWorkflowMapItemSchema>;
export type AgentWorkflowMap = z.infer<typeof agentWorkflowMapSchema>;
export type AgentCapability = z.infer<typeof agentCapabilitySchema>;
export type AgentCapabilities = z.infer<typeof agentCapabilitiesSchema>;
