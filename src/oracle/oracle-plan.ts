import { createHash } from "node:crypto";

import {
  oraclePlanSchema,
  type OraclePlan,
  type OraclePlanOracle,
  type OracleTestStrengthEvidence
} from "../artifacts/schemas/oracle-plan.schema.js";
import { type ContextPack } from "../artifacts/schemas/context-pack.schema.js";
import { type EvidenceProviderIdentity } from "../artifacts/schemas/evidence.schema.js";
import { type PlanDraftArtifact } from "../artifacts/schemas/plan.schema.js";
import { type PolicyArtifact } from "../artifacts/schemas/policy.schema.js";
import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { selectAssuranceProfile } from "../assurance/assurance-profile.js";
import { VispError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import { builtinEvidenceProviders } from "../evidence/provider-registry.js";
import { canonicalJsonV1 } from "../integration/canonical-json.js";
import { contextCopyMismatch, nestedCriterionMismatch } from "./oracle-authority-errors.js";

type BoundArtifact<T> = {
  readonly path: string;
  readonly value: T;
};

export type OracleBaseCommit =
  | { readonly status: "captured"; readonly commit: string }
  | { readonly status: "unavailable"; readonly reason: string };

export type OraclePlanGenerationInput = {
  readonly featureId: string;
  readonly featureSlug: string;
  readonly task: Task;
  readonly specification: BoundArtifact<SpecArtifact>;
  readonly plan: BoundArtifact<PlanDraftArtifact>;
  readonly policy: BoundArtifact<PolicyArtifact>;
  readonly taskGraph: BoundArtifact<TaskGraphArtifact>;
  readonly context: BoundArtifact<ContextPack>;
  readonly baseCommit: OracleBaseCommit;
  readonly testStrengthEvidence: readonly OracleTestStrengthEvidence[];
  readonly requiredProviders?: readonly EvidenceProviderIdentity[];
  readonly generatedAt: string;
};

function sha256Json(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalJsonV1(value), "utf8").digest("hex")}`;
}

function fail(message: string): Result<never, VispError> {
  return err(new VispError("VALIDATION_FAILED", message));
}

function oracleFor(
  input: OraclePlanGenerationInput,
  acceptanceCriterionId: string
): Result<OraclePlanOracle, VispError> {
  const criterion = input.specification.value.acceptanceCriteria.find(
    (candidate) => candidate.id === acceptanceCriterionId
  );

  if (criterion === undefined) {
    return fail(
      `Task ${input.task.id} references missing acceptance criterion ${acceptanceCriterionId}.`
    );
  }

  if (!input.task.requirementIds.includes(criterion.requirementId)) {
    return fail(
      `Acceptance criterion ${criterion.id} belongs to requirement ${criterion.requirementId}, which is not assigned to task ${input.task.id}.`
    );
  }

  const requirement = input.specification.value.requirements.find(
    (candidate) => candidate.id === criterion.requirementId
  );

  if (requirement === undefined) {
    return fail(
      `Acceptance criterion ${criterion.id} references missing requirement ${criterion.requirementId}.`
    );
  }

  const nestedCriterion = requirement.acceptanceCriteria.find(
    (candidate) => candidate.id === criterion.id
  );
  if (
    nestedCriterion === undefined ||
    canonicalJsonV1(nestedCriterion) !== canonicalJsonV1(criterion)
  ) {
    return fail(
      nestedCriterionMismatch({
        requirementId: requirement.id,
        criterionId: criterion.id,
        specPath: input.specification.path,
        authoritative: criterion,
        found: nestedCriterion
      })
    );
  }

  const contextRequirement = input.context.value.includedRequirements.find(
    (candidate) => candidate.id === requirement.id
  );
  if (
    contextRequirement === undefined ||
    canonicalJsonV1(contextRequirement) !== canonicalJsonV1(requirement)
  ) {
    return fail(
      contextCopyMismatch({
        kind: "requirement",
        entityId: requirement.id,
        taskId: input.task.id,
        specPath: input.specification.path,
        contextPath: input.context.path,
        authoritative: requirement,
        found: contextRequirement
      })
    );
  }

  const contextCriterion = input.context.value.includedAcceptanceCriteria.find(
    (candidate) => candidate.id === criterion.id
  );

  if (
    contextCriterion === undefined ||
    canonicalJsonV1(contextCriterion) !== canonicalJsonV1(criterion)
  ) {
    return fail(
      contextCopyMismatch({
        kind: "criterion",
        entityId: criterion.id,
        taskId: input.task.id,
        specPath: input.specification.path,
        contextPath: input.context.path,
        authoritative: criterion,
        found: contextCriterion
      })
    );
  }

  return ok({
    id: `ORACLE-${criterion.id}`,
    requirementId: criterion.requirementId,
    acceptanceCriterionId: criterion.id,
    description: criterion.description,
    priority: requirement.priority,
    validationMethod: criterion.validationMethod,
    baseline: {
      expected: input.task.taskClass === "localized_bug" ? "failed" : "recorded"
    },
    candidate: { expected: "passed" }
  });
}

function validateInputs(input: OraclePlanGenerationInput): Result<void, VispError> {
  if (input.task.taskClass === undefined) {
    return fail(`Task ${input.task.id} has no taskClass; assurance cannot be inferred.`);
  }

  if (input.task.riskFactors === undefined) {
    return fail(`Task ${input.task.id} has no riskFactors; assurance cannot be inferred.`);
  }

  if (input.specification.value.status !== "ready" || input.plan.value.status !== "ready") {
    return fail("Oracle planning requires ready specification and plan artifacts.");
  }

  if (
    input.featureId !== input.specification.value.featureId ||
    input.featureId !== input.plan.value.featureId ||
    input.featureId !== input.taskGraph.value.featureId ||
    input.featureId !== input.context.value.featureId ||
    input.featureSlug !== input.specification.value.featureSlug ||
    input.featureSlug !== input.plan.value.featureSlug ||
    input.featureSlug !== input.context.value.featureSlug ||
    (input.taskGraph.value.featureSlug !== undefined &&
      input.featureSlug !== input.taskGraph.value.featureSlug)
  ) {
    return fail("Oracle plan inputs do not belong to the same feature.");
  }

  const graphTask = input.taskGraph.value.tasks.find((candidate) => candidate.id === input.task.id);
  if (graphTask === undefined || canonicalJsonV1(graphTask) !== canonicalJsonV1(input.task)) {
    return fail(`Task graph does not contain the authoritative task ${input.task.id}.`);
  }

  if (
    input.context.value.taskId !== input.task.id ||
    canonicalJsonV1(input.context.value.selectedTask) !== canonicalJsonV1(input.task)
  ) {
    return fail(
      `Context pack is not bound to authoritative task ${input.task.id}. ` +
        "The pack was generated from an earlier version of this task, most often " +
        "because the task graph was amended afterwards. Regenerate it with " +
        `\`visp-kit context ${input.task.id} --force\` and then re-plan and re-lock the oracle.`
    );
  }

  if (input.task.validationCommands.length === 0) {
    return fail(`Task ${input.task.id} has no validation commands.`);
  }

  if (
    new Set(input.task.validationCommands).size !== input.task.validationCommands.length ||
    new Set(input.context.value.validationCommands).size !==
      input.context.value.validationCommands.length ||
    input.context.value.validationCommands.length === 0 ||
    input.task.validationCommands.some(
      (command) => !input.context.value.validationCommands.includes(command)
    )
  ) {
    return fail(`Validation commands for task ${input.task.id} are missing, duplicated, or stale.`);
  }

  const planCommands = input.plan.value.testingStrategy
    .map((item) => item.validationCommand)
    .filter((command) => command.trim().length > 0 && command.trim().toUpperCase() !== "TBD");
  if (planCommands.some((command) => !input.context.value.validationCommands.includes(command))) {
    return fail(`Context for task ${input.task.id} is stale against the plan validation strategy.`);
  }

  if (
    new Set(input.task.acceptanceCriterionIds).size !== input.task.acceptanceCriterionIds.length
  ) {
    return fail(`Task ${input.task.id} contains duplicate acceptance criteria.`);
  }

  const testPaths = new Set<string>();
  for (const evidence of input.testStrengthEvidence) {
    if (testPaths.has(evidence.path)) {
      return fail(`Test-strength evidence path is duplicated: ${evidence.path}.`);
    }
    if (
      evidence.independence === "pre_existing" &&
      (input.baseCommit.status !== "captured" || evidence.source.commit !== input.baseCommit.commit)
    ) {
      return fail(`Pre-existing test evidence ${evidence.path} is not bound to the base commit.`);
    }
    testPaths.add(evidence.path);
  }

  return ok(undefined);
}

export function generateOraclePlan(
  input: OraclePlanGenerationInput
): Result<OraclePlan, VispError> {
  const valid = validateInputs(input);
  if (!valid.ok) return valid;

  const taskClass = input.task.taskClass;
  const riskFactors = input.task.riskFactors;
  if (taskClass === undefined || riskFactors === undefined) {
    return fail(`Task ${input.task.id} assurance inputs are unavailable.`);
  }

  const oracles: OraclePlanOracle[] = [];
  for (const criterionId of [...input.task.acceptanceCriterionIds].sort()) {
    const oracle = oracleFor(input, criterionId);
    if (!oracle.ok) return oracle;
    oracles.push(oracle.value);
  }

  const assurance = selectAssuranceProfile({
    taskClass,
    riskLevel: input.task.riskLevel,
    riskFactors,
    changedPaths: [...input.task.allowedFiles, ...(input.task.expectedFiles ?? [])],
    policyProfile: input.policy.value.assurance?.profile
  });
  const critical = assurance.selectedProfile === "critical";
  const candidate = {
    version: "1.0" as const,
    featureId: input.featureId,
    featureSlug: input.featureSlug,
    taskId: input.task.id,
    assuranceProfile: assurance.selectedProfile,
    criticalReviewApproval: {
      required: critical,
      status: critical ? ("pending" as const) : ("not_required" as const)
    },
    oracles,
    validationCommands: [...input.context.value.validationCommands],
    testStrengthEvidence: [...input.testStrengthEvidence].sort((left, right) =>
      left.path.localeCompare(right.path)
    ),
    bindings: {
      policy: { path: input.policy.path, sha256: sha256Json(input.policy.value) },
      specification: {
        path: input.specification.path,
        sha256: sha256Json(input.specification.value)
      },
      plan: { path: input.plan.path, sha256: sha256Json(input.plan.value) },
      taskGraph: {
        path: input.taskGraph.path,
        sha256: sha256Json(input.taskGraph.value)
      },
      context: { path: input.context.path, sha256: sha256Json(input.context.value) },
      task: { id: input.task.id, sha256: sha256Json(input.task) }
    },
    baseCommit: input.baseCommit,
    requiredProviders: [...(input.requiredProviders ?? builtinEvidenceProviders)].sort(
      (left, right) => left.id.localeCompare(right.id)
    ),
    generatedAt: input.generatedAt
  };
  const parsed = oraclePlanSchema.safeParse(candidate);

  if (!parsed.success) {
    return fail(
      `Generated oracle plan is invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}`
    );
  }

  return ok(parsed.data);
}

export function validateOraclePlan(
  plan: OraclePlan,
  input: OraclePlanGenerationInput
): Result<OraclePlan, VispError> {
  const generated = generateOraclePlan({ ...input, generatedAt: plan.generatedAt });
  if (!generated.ok) return generated;

  if (canonicalJsonV1(generated.value) !== canonicalJsonV1(plan)) {
    return fail(
      `Oracle plan for task ${plan.taskId} is stale or has been modified. ` +
        "Its recorded inputs no longer match the current task, context pack, or " +
        "policy. Regenerate it with " +
        `\`visp-kit oracle plan --task ${plan.taskId} --force\` and then lock it again.`
    );
  }

  return ok(plan);
}
