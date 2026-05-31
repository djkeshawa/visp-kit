import { z } from "zod";

export const nonEmptyStringSchema = z.string().min(1);
export const isoDateTimeSchema = z.string().datetime();

export const idSchema = nonEmptyStringSchema.regex(
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
  "Use letters, numbers, dots, underscores, colons, or hyphens."
);

export const pathStringSchema = nonEmptyStringSchema;
export const commandStringSchema = nonEmptyStringSchema;
export const stringListSchema = z.array(nonEmptyStringSchema);

export const packageManagerSchema = z.enum([
  "pnpm",
  "npm",
  "yarn",
  "bun",
  "unknown"
]);

export const agentModeSchema = z.enum(["codex", "generic", "none"]);
export const budgetModeSchema = z.enum(["lean", "balanced", "strict"]);
export const presetSchema = z.enum([
  "javascript",
  "typescript",
  "electron",
  "react",
  "node-api",
  "generic"
]);
export const riskLevelSchema = z.enum(["low", "medium", "high"]);

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

export const requirementSourceSchema = z.enum([
  "user",
  "clarification",
  "derived"
]);

export const requirementPrioritySchema = z.enum(["must", "should", "could"]);

export const validationMethodSchema = z.enum([
  "unit",
  "integration",
  "e2e",
  "manual",
  "static"
]);

export const taskStatusSchema = z.enum([
  "pending",
  "ready",
  "in_progress",
  "blocked",
  "done",
  "verified"
]);

export const verificationStatusSchema = z.enum([
  "passed",
  "failed",
  "skipped"
]);

export const traceabilityStatusSchema = z.enum([
  "covered",
  "partial",
  "missing",
  "verified"
]);

export type PackageManager = z.infer<typeof packageManagerSchema>;
export type AgentMode = z.infer<typeof agentModeSchema>;
export type BudgetMode = z.infer<typeof budgetModeSchema>;
export type Preset = z.infer<typeof presetSchema>;
export type RiskLevel = z.infer<typeof riskLevelSchema>;
export type FeatureStatus = z.infer<typeof featureStatusSchema>;
export type RequirementSource = z.infer<typeof requirementSourceSchema>;
export type RequirementPriority = z.infer<typeof requirementPrioritySchema>;
export type ValidationMethod = z.infer<typeof validationMethodSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
export type TraceabilityStatus = z.infer<typeof traceabilityStatusSchema>;
