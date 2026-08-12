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
import { acceptanceCriterionSchema, requirementSchema } from "./requirement.schema.js";
import { taskSchema } from "./task.schema.js";
import {
  gateBlockedCommandSchema,
  gateRuleFindingSchema,
  policyGateSummarySchema,
  policyStatusSchema
} from "./gate.schema.js";
import { strictnessModeSchema } from "./policy.schema.js";

export const contextIncludeModeSchema = z.enum(["summary", "snippet", "full", "new-file"]);

export const contextTokenEstimateSchema = z
  .object({
    input: z.number().int().nonnegative(),
    expectedOutput: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    maxInput: z.number().int().positive(),
    mode: budgetModeSchema,
    estimator: z.enum(["chars-divided-by-four", "model-profile-conservative", "heuristic-v1"]),
    lowerBound: z.number().int().nonnegative().optional(),
    upperBound: z.number().int().nonnegative().optional(),
    profile: z.string().optional(),
    uncertainty: z.string().optional()
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
    // Cross-cutting helpers this project already has, from what scan indexed.
    // Optional so packs written before this field keep parsing.
    reuseHelpers: z
      .array(
        z
          .object({
            path: z.string(),
            concern: z.string(),
            symbols: z.array(z.string())
          })
          .strict()
      )
      .optional(),
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

export const contextArtifactProvenanceSchema = z
  .object({
    label: nonEmptyStringSchema,
    path: pathStringSchema,
    hash: nonEmptyStringSchema,
    hashAlgorithm: z.literal("sha256"),
    /**
     * What the hash is OF.
     *
     * `file` — the artifact's bytes. This is the original and remains the
     * default, so every provenance record written before this field existed
     * keeps its exact meaning.
     *
     * `content` — a canonical reduction defined in `context/retrieval-inputs.ts`,
     * used for the scan caches and the intel projection because their bytes
     * carry a generation timestamp that changes on every scan whether or not
     * anything the pack read changed. A drift check verifies these by
     * re-computing the same reduction, and an entry it cannot re-compute is
     * UNVERIFIED rather than stale.
     */
    hashScope: z.enum(["file", "content"]).optional()
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

export const contextTrimmingSchema = z
  .object({
    removedSnippetCount: z.number().int().nonnegative(),
    removedPatterns: z.boolean(),
    heavilyTrimmed: z.boolean()
  })
  .strict();

/**
 * The compact task model (ADR 0014 Q3), projected from intel's Understanding
 * Case export. Optional: a project with no export produces a pack without this
 * field and behaves exactly as it did before.
 *
 * THE GRAPH STAYS OUTSIDE THE PROMPT. There is deliberately no entity dump, no
 * relation table and no adjacency here — only the cited path, the hypotheses,
 * a handful of signature lines and the counts. Everything else is queried on
 * demand by the agent over intel's MCP (`repo.entity`, `repo.callers`,
 * `repo.callees`, `repo.trace`, `repo.tests`, `repo.evidence`, `repo.search`).
 *
 * All `line` fields are ONE-BASED, converted from intel's zero-based spans at
 * the single boundary in `understanding-view.ts`.
 */
export const contextUnderstandingPathRowSchema = z
  .object({
    relationId: nonEmptyStringSchema,
    kind: nonEmptyStringSchema,
    sourceId: nonEmptyStringSchema,
    targetId: nonEmptyStringSchema,
    sourceDisplayName: z.string(),
    sourceFilePath: z.string().nullable(),
    sourceLine: z.number().int().positive().nullable(),
    targetDisplayName: z.string(),
    targetFilePath: z.string().nullable(),
    targetLine: z.number().int().positive().nullable(),
    evidenceId: nonEmptyStringSchema
  })
  .strict();

export const contextUnderstandingSchema = z
  .object({
    caseId: nonEmptyStringSchema,
    taskId: nonEmptyStringSchema,
    snapshotId: nonEmptyStringSchema,
    repositoryInstanceId: nonEmptyStringSchema,
    current: z.boolean(),
    currentnessReasons: stringListSchema,
    behaviouralQuestion: z.string(),
    // "cited", never "traversed": intel stores path relations as a sorted set,
    // so visit order is gone before the exporter sees them.
    pathOrdering: z.literal("cited"),
    path: z.array(contextUnderstandingPathRowSchema),
    hypotheses: z.array(
      z
        .object({
          id: nonEmptyStringSchema,
          statement: z.string(),
          status: z.enum(["supported", "refuted", "unresolved"]),
          evidenceCount: z.number().int().nonnegative()
        })
        .strict()
    ),
    // `signature` is intel's "<kind> <canonicalName>", NOT declaration text:
    // intel retains no source payload, so there is no parameter list to carry.
    // Renderers must not present it as the declaration.
    signatures: z.array(
      z
        .object({
          entityId: nonEmptyStringSchema,
          displayName: z.string(),
          filePath: z.string().nullable(),
          line: z.number().int().positive().nullable(),
          signature: z.string()
        })
        .strict()
    ),
    affectedTests: z.array(
      z
        .object({
          entityId: nonEmptyStringSchema,
          filePath: z.string().nullable(),
          line: z.number().int().positive().nullable()
        })
        .strict()
    ),
    unknownIds: z.array(nonEmptyStringSchema),
    counts: z
      .object({
        entrypoints: z.number().int().nonnegative(),
        pathRelations: z.number().int().nonnegative(),
        candidateChanges: z.number().int().nonnegative(),
        affectedUnchanged: z.number().int().nonnegative(),
        affectedTests: z.number().int().nonnegative(),
        unknowns: z.number().int().nonnegative()
      })
      .strict()
  })
  .strict();

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
    artifactProvenance: z.array(contextArtifactProvenanceSchema).default([]),
    includedFiles: z.array(contextFileSchema),
    includedSnippets: z.array(contextSnippetSchema),
    validationCommands: z.array(commandStringSchema),
    constraints: stringListSchema,
    instructions: stringListSchema,
    // HEAD at context generation. This is the task's base: change detection
    // judges the diff since here PLUS the working tree, so an agent that
    // commits before running save is judged on the same work as one that
    // does not. Optional — packs written before this field keep parsing, and
    // a project without git simply has no base.
    baseCommit: z.string().optional(),
    /**
     * Whether the compact snippet cap shaped this pack.
     *
     * Recorded because the cap is the difference between a ~16.7k-token pack
     * and an ~8.0k-token one, and anyone scoring a pack has to be able to read
     * which of those they are holding out of the artifact rather than out of a
     * command line somebody remembers running. Optional so packs written before
     * this field keep parsing.
     */
    snippetCapApplied: z.boolean().optional(),
    strictnessMode: strictnessModeSchema.optional(),
    policyStatus: policyStatusSchema.optional(),
    gateStatus: z.enum(["allowed", "blocked", "warnings", "not_evaluated"]).optional(),
    failedGateRules: z.array(gateRuleFindingSchema).optional(),
    blockedCommands: z.array(gateBlockedCommandSchema).optional(),
    policyGate: policyGateSummarySchema.optional(),
    understanding: contextUnderstandingSchema.optional(),
    trimming: contextTrimmingSchema.optional(),
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
export type ContextArtifactProvenance = z.infer<typeof contextArtifactProvenanceSchema>;
export type ContextFile = z.infer<typeof contextFileSchema>;
export type ContextSnippet = z.infer<typeof contextSnippetSchema>;
export type ContextTrimming = z.infer<typeof contextTrimmingSchema>;
export type ContextUnderstanding = z.infer<typeof contextUnderstandingSchema>;
export type ContextUnderstandingPathRow = z.infer<typeof contextUnderstandingPathRowSchema>;
export type ContextPack = z.infer<typeof contextPackSchema>;
