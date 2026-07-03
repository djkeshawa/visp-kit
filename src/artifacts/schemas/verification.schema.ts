import { z } from "zod";

import {
  commandStringSchema,
  idSchema,
  isoDateTimeSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  stringListSchema
} from "./common.schema.js";
import { policyGateSummarySchema } from "./gate.schema.js";

export const verificationModeSchema = z.enum([
  "targeted",
  "all",
  "feature",
  "artifacts",
  "traceability",
  "scope",
  "dependencies",
  "custom"
]);

export const verificationCheckStatusSchema = z.enum(["passed", "failed", "skipped", "warned"]);

export const verificationCommandRunnerSchema = z
  .object({
    executionMode: z.enum(["argv", "shell"]),
    stdioMode: z.enum(["capture", "inherit", "file"]),
    outputCaptureMode: z.enum(["captured", "inherited", "file"]),
    platform: nonEmptyStringSchema,
    shell: z.string().nullable(),
    executable: nonEmptyStringSchema,
    args: z.array(z.string()),
    pid: z.number().int().positive().nullable(),
    profile: z.enum(["default", "terminal-compatible"]),
    profileReason: z.string().nullable()
  })
  .strict();

export const verificationCommandResultSchema = z
  .object({
    command: commandStringSchema,
    cwd: pathStringSchema,
    exitCode: z.number().int().nullable(),
    success: z.boolean(),
    durationMs: z.number().int().nonnegative(),
    startedAt: isoDateTimeSchema,
    endedAt: isoDateTimeSchema,
    stdout: z.string(),
    stderr: z.string(),
    stdoutTruncated: z.boolean(),
    stderrTruncated: z.boolean(),
    skipped: z.boolean(),
    skipReason: z.string().nullable(),
    timedOut: z.boolean(),
    runner: verificationCommandRunnerSchema.optional()
  })
  .strict();

export const artifactValidationResultSchema = z
  .object({
    path: pathStringSchema,
    required: z.boolean(),
    present: z.boolean(),
    passed: z.boolean(),
    errors: stringListSchema,
    warnings: stringListSchema
  })
  .strict();

export const artifactValidationSectionSchema = z
  .object({
    status: verificationCheckStatusSchema,
    checked: z.array(artifactValidationResultSchema),
    warnings: stringListSchema,
    errors: stringListSchema
  })
  .strict();

export const traceabilityValidationSectionSchema = z
  .object({
    status: verificationCheckStatusSchema,
    checkedTaskId: idSchema.nullable(),
    warnings: stringListSchema,
    errors: stringListSchema
  })
  .strict();

export const commandValidationSectionSchema = z
  .object({
    status: verificationCheckStatusSchema,
    commands: z.array(verificationCommandResultSchema),
    warnings: stringListSchema,
    errors: stringListSchema
  })
  .strict();

export const scopeValidationSectionSchema = z
  .object({
    status: verificationCheckStatusSchema,
    changedFiles: z.array(pathStringSchema),
    allowedFiles: z.array(pathStringSchema),
    expectedFiles: z.array(pathStringSchema),
    forbiddenFiles: z.array(pathStringSchema),
    outOfScopeFiles: z.array(pathStringSchema),
    forbiddenChangedFiles: z.array(pathStringSchema),
    unmappedChangedFiles: z.array(pathStringSchema),
    warnings: stringListSchema,
    errors: stringListSchema
  })
  .strict();

export const dependencyValidationSectionSchema = z
  .object({
    status: verificationCheckStatusSchema,
    changedDependencyFiles: z.array(pathStringSchema),
    approvedByTaskScope: z.boolean(),
    approvedByPlan: z.boolean(),
    warnings: stringListSchema,
    errors: stringListSchema
  })
  .strict();

export const verificationSummarySchema = z
  .object({
    passed: z.boolean(),
    failed: z.boolean(),
    warnings: z.number().int().nonnegative(),
    commandsRun: z.number().int().nonnegative(),
    commandsPassed: z.number().int().nonnegative(),
    commandsFailed: z.number().int().nonnegative(),
    artifactsChecked: z.number().int().nonnegative(),
    artifactsFailed: z.number().int().nonnegative(),
    scopeViolations: z.number().int().nonnegative(),
    dependencyViolations: z.number().int().nonnegative()
  })
  .strict();

export const verificationReportSchema = z
  .object({
    id: idSchema,
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema,
    taskId: idSchema.nullable(),
    mode: verificationModeSchema,
    startedAt: isoDateTimeSchema,
    endedAt: isoDateTimeSchema,
    durationMs: z.number().int().nonnegative(),
    success: z.boolean(),
    summary: verificationSummarySchema,
    artifactValidation: artifactValidationSectionSchema,
    traceabilityValidation: traceabilityValidationSectionSchema,
    commandValidation: commandValidationSectionSchema,
    scopeValidation: scopeValidationSectionSchema,
    dependencyValidation: dependencyValidationSectionSchema,
    policyGate: policyGateSummarySchema.optional(),
    warnings: stringListSchema,
    errors: stringListSchema,
    nextCommand: nonEmptyStringSchema
  })
  .strict();

export type VerificationMode = z.infer<typeof verificationModeSchema>;
export type VerificationCheckStatus = z.infer<typeof verificationCheckStatusSchema>;
export type VerificationCommandRunner = z.infer<typeof verificationCommandRunnerSchema>;
export type VerificationCommandResult = z.infer<typeof verificationCommandResultSchema>;
export type ArtifactValidationResult = z.infer<typeof artifactValidationResultSchema>;
export type ArtifactValidationSection = z.infer<typeof artifactValidationSectionSchema>;
export type TraceabilityValidationSection = z.infer<typeof traceabilityValidationSectionSchema>;
export type CommandValidationSection = z.infer<typeof commandValidationSectionSchema>;
export type ScopeValidationSection = z.infer<typeof scopeValidationSectionSchema>;
export type DependencyValidationSection = z.infer<typeof dependencyValidationSectionSchema>;
export type VerificationSummary = z.infer<typeof verificationSummarySchema>;
export type VerificationReport = z.infer<typeof verificationReportSchema>;
