import { createHash } from "node:crypto";

import { z } from "zod/v4";

import { canonicalJsonV1, type Sha256Hash } from "./canonical-json.js";
import { type CanonicalWorkflowAction } from "./canonical-workflow-action.js";

export const SUPPORTED_WORKFLOW_ACTION_PROTOCOLS = Object.freeze(["2.0", "3.0"] as const);
export const DEFAULT_WORKFLOW_ACTION_PROTOCOL = "2.0" as const;

export type WorkflowActionProtocol = (typeof SUPPORTED_WORKFLOW_ACTION_PROTOCOLS)[number];

export function isWorkflowActionProtocol(value: unknown): value is WorkflowActionProtocol {
  return (
    typeof value === "string" &&
    (SUPPORTED_WORKFLOW_ACTION_PROTOCOLS as readonly string[]).includes(value)
  );
}

const jsonSchemaDraft = "https://json-schema.org/draft/2020-12/schema" as const;
const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const nonEmptyStringSchema = z.string().min(1);
const idSchema = nonEmptyStringSchema.regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const projectPathPatternSource =
  "^(?!/)(?![A-Za-z]:/)(?!.*[\\\\\\x00])(?!\\.{1,2}(?:/|$))(?!.+/\\.{1,2}(?:/|$))(?!.*[/][/])(?!.+/$).+$";
const projectPathPattern = new RegExp(projectPathPatternSource, "u");
const projectPathSchema = nonEmptyStringSchema.regex(projectPathPattern);

const unavailableReasonSchema = z.enum([
  "not_in_source_artifact",
  "not_in_protocol",
  "source_missing",
  "source_invalid",
  "not_captured",
  "unsupported"
]);
const notApplicableReasonSchema = z.enum([
  "no_active_feature",
  "no_active_task",
  "stage_does_not_require_value"
]);

function declaredValueSchema<T extends z.ZodType>(valueSchema: T) {
  return z.discriminatedUnion("state", [
    z.object({ state: z.literal("available"), value: valueSchema }).strict(),
    z.object({ state: z.literal("unavailable"), reasonCode: unavailableReasonSchema }).strict(),
    z.object({ state: z.literal("not_applicable"), reasonCode: notApplicableReasonSchema }).strict()
  ]);
}

export const workflowActionV2Schema = z
  .object({
    protocolVersion: z.literal("2.0"),
    phase: z.enum(["clarify", "specify", "plan", "task", "implement", "verify"]),
    taskId: z.string().nullable(),
    goal: z.string(),
    requiredReads: z.array(
      z.object({ path: z.string(), role: z.string(), sha256: z.string() }).strict()
    ),
    writablePaths: z.array(z.string()),
    forbiddenPaths: z.array(z.string()),
    acceptanceOracles: z.array(
      z.object({ id: z.string(), expectedBehavior: z.string(), validation: z.string() }).strict()
    ),
    validationCommands: z.array(z.string()),
    assuranceLevel: z.enum(["kit_strict", "local_checked", "advisory"]),
    verdict: z.enum(["ready", "blocked", "inconclusive"]),
    findings: z.array(z.string()),
    nextCommand: z.string()
  })
  .strict();

const workflowPhaseSchema = z.enum([
  "next",
  "setup",
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
const featureSchema = z.object({ id: idSchema, slug: nonEmptyStringSchema }).strict();
const taskSchema = z
  .object({
    id: idSchema,
    title: nonEmptyStringSchema,
    status: z.enum(["pending", "ready", "in_progress", "blocked", "done", "verified"]),
    dependsOn: z.array(idSchema),
    parallelizable: z.boolean()
  })
  .strict();
const taskClassSchema = z.enum([
  "localized_bug",
  "bounded_feature",
  "cross_file_change",
  "regression_test",
  "refactor",
  "migration",
  "security",
  "documentation"
]);
const riskFactorSchema = z
  .object({
    version: z.literal("1.0"),
    code: z.enum([
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
    ])
  })
  .strict();
const hashedReadSchema = z
  .object({
    id: idSchema,
    role: z.enum([
      "policy",
      "intent",
      "specification",
      "plan",
      "task_graph",
      "context_pack",
      "implementation_prompt",
      "oracle_plan"
    ]),
    path: projectPathSchema,
    contentHash: sha256Schema,
    freshness: z.literal("content_hash")
  })
  .strict();
const operationLimitsSchema = z
  .object({
    version: z.literal("1.0"),
    maxChangedFiles: z.number().int().min(0),
    dependencyChangesAllowed: z.boolean()
  })
  .strict();
const requirementClaimSchema = z
  .object({
    id: idSchema,
    statement: nonEmptyStringSchema,
    priority: z.enum(["must", "should", "could"]),
    acceptanceCriterionIds: z.array(idSchema),
    accountableOwner: declaredValueSchema(nonEmptyStringSchema)
  })
  .strict();
const validationOracleSchema = z
  .object({
    id: idSchema,
    claimId: idSchema,
    statement: nonEmptyStringSchema,
    testable: z.boolean(),
    validationMethod: z.enum(["unit", "integration", "e2e", "manual", "static"])
  })
  .strict();
const evidenceTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("command"), command: nonEmptyStringSchema }).strict(),
  z.object({ kind: z.literal("validation_oracle"), oracleId: idSchema }).strict(),
  z.object({ kind: z.literal("static_check"), checkId: idSchema }).strict(),
  z.object({ kind: z.literal("security_check"), checkId: idSchema }).strict(),
  z.object({ kind: z.literal("human_review"), reviewId: idSchema }).strict()
]);
const evidenceRequirementSchema = z
  .object({
    version: z.literal("1.0"),
    id: idSchema,
    providerId: idSchema,
    target: evidenceTargetSchema,
    freshnessRule: nonEmptyStringSchema,
    independenceRule: nonEmptyStringSchema,
    requiredVerdict: z.literal("passed")
  })
  .strict();
const appliedPolicyOverrideSchema = z
  .object({
    overrideId: idSchema,
    ruleId: idSchema,
    scope: z.enum(["project", "feature", "task", "stage"]),
    reason: nonEmptyStringSchema,
    expiresAt: z.string().datetime().nullable(),
    appliedToStage: workflowPhaseSchema,
    appliedToFeatureId: idSchema.nullable(),
    appliedToTaskId: idSchema.nullable()
  })
  .strict();
const findingSchema = z
  .object({
    code: nonEmptyStringSchema,
    source: z.enum(["policy", "workflow", "contract", "freshness"]),
    severity: z.enum(["info", "warning", "error"]),
    effect: z.enum(["none", "blocks", "uncertain"]),
    message: nonEmptyStringSchema,
    recommendation: nonEmptyStringSchema,
    evidence: z.array(z.string())
  })
  .strict();

export const workflowActionV3Schema = z
  .object({
    protocolVersion: z.literal("3.0"),
    canonicalVersion: z.literal("1.0"),
    actionId: sha256Schema,
    phase: workflowPhaseSchema,
    feature: featureSchema.nullable(),
    task: taskSchema.nullable(),
    taskClass: declaredValueSchema(taskClassSchema),
    risk: z
      .object({
        level: declaredValueSchema(z.enum(["low", "medium", "high"])),
        factors: declaredValueSchema(z.array(riskFactorSchema))
      })
      .strict(),
    assurance: z
      .object({
        level: z.enum(["kit_strict", "advisory"]),
        profile: declaredValueSchema(z.enum(["routine", "behavioral", "critical"])),
        workflowStrictness: declaredValueSchema(z.enum(["relaxed", "standard", "strict", "locked"]))
      })
      .strict(),
    goal: nonEmptyStringSchema,
    baseCommit: declaredValueSchema(nonEmptyStringSchema),
    requiredReads: z.array(hashedReadSchema),
    scope: z
      .object({
        writablePaths: z.array(projectPathSchema),
        expectedPaths: declaredValueSchema(z.array(projectPathSchema)),
        forbiddenPaths: z.array(projectPathSchema),
        operationLimits: declaredValueSchema(operationLimitsSchema)
      })
      .strict(),
    claims: declaredValueSchema(z.array(requirementClaimSchema)),
    validationOracles: z.array(validationOracleSchema),
    validationCommands: z.array(nonEmptyStringSchema),
    requiredEvidence: declaredValueSchema(z.array(evidenceRequirementSchema)),
    policy: z
      .object({
        status: declaredValueSchema(z.enum(["valid", "missing", "invalid", "default"])),
        appliedOverrides: declaredValueSchema(z.array(appliedPolicyOverrideSchema))
      })
      .strict(),
    findings: z.array(findingSchema),
    verdict: z.enum(["ready", "blocked", "inconclusive"]),
    nextCommand: nonEmptyStringSchema
  })
  .strict();

export type WorkflowActionV2 = z.infer<typeof workflowActionV2Schema>;
export type WorkflowActionV3 = z.infer<typeof workflowActionV3Schema>;
export type WorkflowAction = WorkflowActionV2 | WorkflowActionV3;
export type WorkflowActionSchemaDocument = Readonly<Record<string, unknown>>;

type WireShape<T> = T extends Sha256Hash
  ? string
  : T extends readonly (infer Item)[]
    ? WireShape<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: WireShape<T[Key]> }
      : T;
type WorkflowActionV3Body = Omit<WorkflowActionV3, "protocolVersion">;
type CanonicalWireBody = WireShape<CanonicalWorkflowAction>;
type Assert<T extends true> = T;
type _V3MatchesCanonical = Assert<
  WorkflowActionV3Body extends CanonicalWireBody
    ? CanonicalWireBody extends WorkflowActionV3Body
      ? true
      : false
    : false
>;

const schemaIds: Record<WorkflowActionProtocol, string> = {
  "2.0": "urn:visp:schema:workflow-action:2.0",
  "3.0": "urn:visp:schema:workflow-action:3.0"
};

export function generateWorkflowActionSchemaDocument(
  protocol: WorkflowActionProtocol
): WorkflowActionSchemaDocument {
  const schema = protocol === "2.0" ? workflowActionV2Schema : workflowActionV3Schema;
  const generated = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    reused: "inline"
  }) as Record<string, unknown>;
  const { $schema: _generatedDraft, ...body } = generated;

  return deepFreeze({
    $schema: jsonSchemaDraft,
    $id: schemaIds[protocol],
    title: `Visp WorkflowAction ${protocol}`,
    ...body
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export const WORKFLOW_ACTION_SCHEMA_HASHES = Object.freeze({
  "2.0": "sha256:c63b279b1ce89f047b2be696a47e845a57adda7f8437892e211e3a4cfad39ed6",
  "3.0": "sha256:ceb45ad3a27a4172c4dbe7e7caacf473570f4578eda27744662a8ed094e96ce7"
} satisfies Record<WorkflowActionProtocol, Sha256Hash>);

export function generatedWorkflowActionSchemaHash(protocol: WorkflowActionProtocol): Sha256Hash {
  return `sha256:${createHash("sha256")
    .update(canonicalJsonV1(generateWorkflowActionSchemaDocument(protocol)), "utf8")
    .digest("hex")}`;
}

export function workflowActionSchemaHash(protocol: WorkflowActionProtocol): Sha256Hash {
  return WORKFLOW_ACTION_SCHEMA_HASHES[protocol];
}
