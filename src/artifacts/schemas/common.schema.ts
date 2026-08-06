import { z } from "zod";
import { z as z4 } from "zod/v4";

export const nonEmptyStringSchema = z.string().min(1);
export const isoDateTimeSchema = z.string().datetime();

export const idSchema = nonEmptyStringSchema.regex(
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
  "Use letters, numbers, dots, underscores, colons, or hyphens."
);

export const pathStringSchema = nonEmptyStringSchema;
export const commandStringSchema = nonEmptyStringSchema;
export const stringListSchema = z.array(nonEmptyStringSchema);

export const packageManagerSchema = z.enum(["pnpm", "npm", "yarn", "bun", "unknown"]);

export const agentModeSchema = z.enum(["codex", "generic", "none"]);
export const budgetModeSchema = z.enum(["lean", "balanced", "strict"]);
export const presetSchema = z.enum([
  "javascript",
  "typescript",
  "electron",
  "react",
  "node-api",
  "go",
  "java",
  "python",
  "rust",
  "generic"
]);
/**
 * Can the change be undone? (P8-05)
 *
 * Risk level says how much a mistake would cost; this says whether it can be
 * taken back. Both reports build their entire autonomy model on the second
 * question, and nothing in Kit asked it before: a `high` risk task that is
 * trivially revertible and one that cannot be restored were indistinguishable.
 *
 * - `reversible`   — undo restores the prior state exactly (a branch edit).
 * - `compensable`  — no true undo, but a defined compensating action exists,
 *                    possibly with loss (a corrective migration).
 * - `irreversible` — cannot be taken back, or restore is untested.
 */
export const reversibilityValues = ["reversible", "compensable", "irreversible"] as const;
export const reversibilitySchema = z.enum(reversibilityValues);

/**
 * How far the effects reach (P8-05). Scope of consequence, distinct from
 * probability of error.
 *
 * - `task`     — confined to this task's own workspace.
 * - `project`  — other parts of this repository or its build.
 * - `external` — anything outside it: published artifacts, shared data, other
 *                people.
 */
export const blastRadiusValues = ["task", "project", "external"] as const;
export const blastRadiusSchema = z.enum(blastRadiusValues);

/**
 * What a host must do before acting (P8-05).
 *
 * Derived by Kit and enforced by Hyper. Hyper never computes it — deriving it
 * there would make Hyper a second authority on permission, which rule 3 of the
 * workspace boundary forbids.
 */
export const approvalClassValues = ["autonomous", "checkpointed", "approval_required"] as const;
export const approvalClassSchema = z.enum(approvalClassValues);

export const riskLevelValues = ["low", "medium", "high"] as const;
export const riskLevelSchema = z.enum(riskLevelValues);
export const riskLevelSchemaV4 = z4.enum(riskLevelValues);

export const taskClassValues = [
  "localized_bug",
  "bounded_feature",
  "cross_file_change",
  "regression_test",
  "refactor",
  "migration",
  "security",
  "documentation"
] as const;
export const taskClassSchema = z.enum(taskClassValues);
export const taskClassSchemaV4 = z4.enum(taskClassValues);

export const riskFactorCodeValues = [
  "authentication",
  "authorization",
  "cryptography",
  "public_api",
  "schema",
  "dependency",
  "concurrency",
  "permissions",
  "deployment",
  "data_migration"
] as const;
export const riskFactorCodeSchema = z.enum(riskFactorCodeValues);
export const riskFactorCodeSchemaV4 = z4.enum(riskFactorCodeValues);
export const riskFactorSchema = z
  .object({
    version: z.literal("1.0"),
    code: riskFactorCodeSchema
  })
  .strict();
export const riskFactorSchemaV4 = z4
  .object({
    version: z4.literal("1.0"),
    code: riskFactorCodeSchemaV4
  })
  .strict();
export const riskFactorsSchema = z.array(riskFactorSchema).superRefine((factors, context) => {
  const seen = new Set<string>();

  for (const [index, factor] of factors.entries()) {
    if (seen.has(factor.code)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate risk factor code: ${factor.code}.`,
        path: [index, "code"]
      });
    }
    seen.add(factor.code);
  }
});

export const featureStatusSchema = z.enum([
  "draft",
  "clarifying",
  "specified",
  "planned",
  "tasks_ready",
  "in_progress",
  "blocked",
  "done",
  "verified",
  "reconciled",
  "archived"
]);

// "intent" is accepted because clarifications.json already uses that exact word
// for the same idea — a statement traceable to the user's original feature
// intent. Two adjacent artifacts spelling one concept differently under an
// identically named `source` field is a papercut every author hits: a
// requirement written from the feature idea is rejected with "Expected 'user' |
// 'clarification' | 'derived', received 'intent'".
//
// Widening is backward compatible: every artifact valid before is valid now.
// This enum is deliberately NOT part of the hashed WorkflowAction protocol
// schema, so no coordinated release is required — unlike riskFactors, which is.
export const requirementSourceSchema = z.enum([
  "user",
  "intent",
  "clarification",
  "derived"
]);

export const requirementPrioritySchema = z.enum(["must", "should", "could"]);

export const validationMethodSchema = z.enum(["unit", "integration", "e2e", "manual", "static"]);

export const taskStatusSchema = z.enum([
  "pending",
  "ready",
  "in_progress",
  "blocked",
  "done",
  "verified"
]);

export const verificationStatusSchema = z.enum(["passed", "failed", "skipped"]);

export const traceabilityStatusSchema = z.enum(["covered", "partial", "missing", "verified"]);

export type PackageManager = z.infer<typeof packageManagerSchema>;
export type AgentMode = z.infer<typeof agentModeSchema>;
export type BudgetMode = z.infer<typeof budgetModeSchema>;
export type Preset = z.infer<typeof presetSchema>;
export type RiskLevel = z.infer<typeof riskLevelSchema>;
export type TaskClass = z.infer<typeof taskClassSchema>;
export type RiskFactorCode = z.infer<typeof riskFactorCodeSchema>;
export type RiskFactor = z.infer<typeof riskFactorSchema>;
export type FeatureStatus = z.infer<typeof featureStatusSchema>;
export type RequirementSource = z.infer<typeof requirementSourceSchema>;
export type Reversibility = z.infer<typeof reversibilitySchema>;
export type BlastRadius = z.infer<typeof blastRadiusSchema>;
export type ApprovalClass = z.infer<typeof approvalClassSchema>;
export type RequirementPriority = z.infer<typeof requirementPrioritySchema>;
export type ValidationMethod = z.infer<typeof validationMethodSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
export type TraceabilityStatus = z.infer<typeof traceabilityStatusSchema>;
