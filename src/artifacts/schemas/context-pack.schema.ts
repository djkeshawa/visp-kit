import { z } from "zod";

import {
  budgetModeSchema,
  commandStringSchema,
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  riskLevelSchema,
  stringListSchema
} from "./common.schema.js";
import {
  acceptanceCriterionSchema,
  requirementSchema
} from "./requirement.schema.js";
import { taskSchema } from "./task.schema.js";
import {
  gateBlockedCommandSchema,
  gateRuleFindingSchema,
  policyGateSummarySchema,
  policyStatusSchema
} from "./gate.schema.js";
import { strictnessModeSchema } from "./policy.schema.js";

export const contextIncludeModeSchema = z.enum([
  "summary",
  "snippet",
  "full",
  "new-file"
]);

export const contextTokenEstimateSchema = z
  .object({
    input: z.number().int().nonnegative(),
    expectedOutput: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    maxInput: z.number().int().positive(),
    mode: budgetModeSchema,
    estimator: z.literal("chars-divided-by-four")
  })
  .strict();

export const contextPlanDecisionSchema = z
  .object({
    id: idSchema,
    title: nonEmptyStringSchema,
    summary: nonEmptyStringSchema,
    requirementIds: z.array(idSchema)
  })
  .strict();

export const contextPlanRiskSchema = z
  .object({
    id: idSchema,
    description: nonEmptyStringSchema,
    level: riskLevelSchema,
    mitigation: nonEmptyStringSchema,
    requirementIds: z.array(idSchema)
  })
  .strict();

export const contextConstitutionRuleSchema = z
  .object({
    id: idSchema,
    text: nonEmptyStringSchema
  })
  .strict();

export const contextProjectContextSchema = z
  .object({
    summary: z.string(),
    patterns: z.string(),
    warnings: stringListSchema
  })
  .strict();

export const contextDependencyTaskSchema = z
  .object({
    id: idSchema,
    title: nonEmptyStringSchema,
    status: nonEmptyStringSchema,
    dependsOn: z.array(idSchema)
  })
  .strict();

export const contextFileSchema = z
  .object({
    path: pathStringSchema,
    reason: nonEmptyStringSchema,
    includeMode: contextIncludeModeSchema,
    hash: nonEmptyStringSchema,
    language: nonEmptyStringSchema,
    sizeBytes: z.number().int().nonnegative(),
    tokenEstimate: z.number().int().nonnegative(),
    summaryAvailable: z.boolean(),
    snippetIncluded: z.boolean(),
    summary: z.string().optional(),
    warning: z.string().optional()
  })
  .strict();

export const contextSnippetSchema = z
  .object({
    filePath: pathStringSchema,
    reason: nonEmptyStringSchema,
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    content: nonEmptyStringSchema,
    tokenEstimate: z.number().int().nonnegative()
  })
  .strict()
  .refine((snippet) => snippet.endLine >= snippet.startLine, {
    message: "endLine must be greater than or equal to startLine.",
    path: ["endLine"]
  });

export const contextPackSchema = z
  .object({
    id: idSchema,
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema,
    taskId: idSchema,
    budgetMode: budgetModeSchema,
    estimatedTokens: contextTokenEstimateSchema,
    overBudget: z.boolean(),
    recommendation: nonEmptyStringSchema,
    warnings: stringListSchema,
    selectedTask: taskSchema,
    includedRequirements: z.array(requirementSchema),
    includedAcceptanceCriteria: z.array(acceptanceCriterionSchema),
    includedPlanDecisions: z.array(contextPlanDecisionSchema),
    includedRisks: z.array(contextPlanRiskSchema),
    includedDependencyTasks: z.array(contextDependencyTaskSchema),
    includedConstitutionRules: z.array(contextConstitutionRuleSchema),
    includedProjectContext: contextProjectContextSchema,
    includedFiles: z.array(contextFileSchema),
    includedSnippets: z.array(contextSnippetSchema),
    validationCommands: z.array(commandStringSchema),
    constraints: stringListSchema,
    instructions: stringListSchema,
    strictnessMode: strictnessModeSchema.optional(),
    policyStatus: policyStatusSchema.optional(),
    gateStatus: z.enum(["allowed", "blocked", "warnings", "not_evaluated"]).optional(),
    failedGateRules: z.array(gateRuleFindingSchema).optional(),
    blockedCommands: z.array(gateBlockedCommandSchema).optional(),
    policyGate: policyGateSummarySchema.optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export type ContextIncludeMode = z.infer<typeof contextIncludeModeSchema>;
export type ContextTokenEstimate = z.infer<typeof contextTokenEstimateSchema>;
export type ContextPlanDecision = z.infer<typeof contextPlanDecisionSchema>;
export type ContextPlanRisk = z.infer<typeof contextPlanRiskSchema>;
export type ContextConstitutionRule = z.infer<typeof contextConstitutionRuleSchema>;
export type ContextProjectContext = z.infer<typeof contextProjectContextSchema>;
export type ContextDependencyTask = z.infer<typeof contextDependencyTaskSchema>;
export type ContextFile = z.infer<typeof contextFileSchema>;
export type ContextSnippet = z.infer<typeof contextSnippetSchema>;
export type ContextPack = z.infer<typeof contextPackSchema>;
