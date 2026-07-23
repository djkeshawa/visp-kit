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

export const requirementSourceSchema = z.enum(["user", "clarification", "derived"]);

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
export type RequirementPriority = z.infer<typeof requirementPrioritySchema>;
export type ValidationMethod = z.infer<typeof validationMethodSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
export type TraceabilityStatus = z.infer<typeof traceabilityStatusSchema>;
