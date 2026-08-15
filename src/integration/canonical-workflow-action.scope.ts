import { type Task } from "../artifacts/schemas/task.schema.js";
import { type ProjectState } from "../orchestrator/project-state.js";
import { compareUtf16CodeUnits, sortedUnique } from "./canonical-json.js";
import {
  type AddFinding,
  available,
  duplicateValues,
  normalizePathSetWithPresentation,
  notApplicable,
  unavailable
} from "./canonical-workflow-action.findings.js";
import {
  type CanonicalWorkflowActionIdentityInput,
  type CanonicalWorkflowActionV2Presentation,
  type CanonicalWorkflowPhase,
  type DeclaredValue,
  type RequirementClaim,
  type ValidationOracle
} from "./canonical-workflow-action.types.js";

export function featureStagePaths(
  phase: CanonicalWorkflowPhase,
  featurePath: string | undefined
): string[] | undefined {
  if (featurePath === undefined) return undefined;
  if (phase === "clarify") return [`${featurePath}/clarifications.json`];
  if (phase === "spec") {
    return [`${featurePath}/spec.json`, `${featurePath}/traceability.json`];
  }
  if (phase === "plan") return [`${featurePath}/plan.json`];
  if (phase === "tasks" || phase === "context") {
    return [`${featurePath}/task-graph.json`, `${featurePath}/traceability.json`];
  }
  return undefined;
}

export function actionScope(input: {
  readonly phase: CanonicalWorkflowPhase;
  readonly featurePath?: string;
  readonly task?: Task;
  readonly addFinding: AddFinding;
}): {
  readonly scope: CanonicalWorkflowActionIdentityInput["scope"];
  readonly presentation: Pick<
    CanonicalWorkflowActionV2Presentation,
    "writablePaths" | "forbiddenPaths"
  >;
} {
  const featurePaths = featureStagePaths(input.phase, input.featurePath);
  if (featurePaths !== undefined) {
    const writable = normalizePathSetWithPresentation(featurePaths, input.addFinding);
    const forbidden = normalizePathSetWithPresentation(
      input.task?.forbiddenFiles ?? [],
      input.addFinding
    );
    return {
      scope: {
        writablePaths: writable.values,
        expectedPaths: available(writable.values),
        forbiddenPaths: forbidden.values,
        operationLimits: unavailable("not_captured")
      },
      presentation: {
        writablePaths: writable.presentation,
        forbiddenPaths: forbidden.presentation
      }
    };
  }

  const forbidden = normalizePathSetWithPresentation(
    input.task?.forbiddenFiles ?? [],
    input.addFinding
  );
  const usesTaskScope = input.phase === "implement" || input.phase === "pr";
  if (usesTaskScope && input.task !== undefined) {
    const expectedResult =
      input.task.expectedFiles === undefined
        ? undefined
        : normalizePathSetWithPresentation(input.task.expectedFiles, input.addFinding);
    const expected =
      expectedResult === undefined
        ? unavailable<readonly string[]>("not_in_source_artifact")
        : available<readonly string[]>(expectedResult.values);
    const writable = normalizePathSetWithPresentation(
      [...new Set([...input.task.allowedFiles, ...(input.task.expectedFiles ?? [])])],
      input.addFinding
    );
    return {
      scope: {
        writablePaths: writable.values,
        expectedPaths: expected,
        forbiddenPaths: forbidden.values,
        operationLimits: unavailable("not_captured")
      },
      presentation: {
        writablePaths: writable.presentation,
        forbiddenPaths: forbidden.presentation
      }
    };
  }

  return {
    scope: {
      writablePaths: [],
      expectedPaths: usesTaskScope
        ? notApplicable("no_active_task")
        : input.featurePath === undefined && input.phase === "feature"
          ? notApplicable("no_active_feature")
          : notApplicable("stage_does_not_require_value"),
      forbiddenPaths: forbidden.values,
      operationLimits: unavailable("not_captured")
    },
    presentation: {
      writablePaths: [],
      forbiddenPaths: forbidden.presentation
    }
  };
}

export function claimContext(
  state: ProjectState,
  addFinding: AddFinding
): {
  readonly claims: DeclaredValue<readonly RequirementClaim[]>;
  readonly oracles: readonly ValidationOracle[];
  readonly oracleOrder: readonly string[];
} {
  const task = state.selectedTask;
  if (task === undefined) {
    const source = state.spec;
    if (source === undefined) {
      return {
        claims: notApplicable("no_active_task"),
        oracles: [],
        oracleOrder: []
      };
    }
    const duplicateRequirements = duplicateValues(source.requirements.map(({ id }) => id));
    const duplicateCriteria = duplicateValues(source.acceptanceCriteria.map(({ id }) => id));
    const requirementIds = new Set(source.requirements.map(({ id }) => id));
    const invalidCriteria = source.acceptanceCriteria.filter(
      (criterion) => !requirementIds.has(criterion.requirementId)
    );
    const crossFeatureRequirements = source.requirements.filter(
      (requirement) =>
        state.selectedFeature !== undefined && requirement.featureId !== state.selectedFeature.id
    );
    if (duplicateRequirements.length > 0 || duplicateCriteria.length > 0) {
      addFinding({
        code: "VISP.CONTRACT.CLAIM_MAPPING_DUPLICATE",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "Task claim sources contain duplicate stable IDs.",
        recommendation: "Regenerate the task claim source with one record per stable ID.",
        evidence: [
          ...duplicateRequirements.map((id) => `requirement:${id}`),
          ...duplicateCriteria.map((id) => `criterion:${id}`)
        ]
      });
    }
    if (crossFeatureRequirements.length > 0) {
      addFinding({
        code: "VISP.CONTRACT.REQUIREMENT_FEATURE_MISMATCH",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "One or more mapped requirements belong to another feature.",
        recommendation: "Regenerate task mappings from the active feature specification.",
        evidence: crossFeatureRequirements.map(
          (requirement) => `${requirement.id}:${requirement.featureId}`
        )
      });
    }
    if (invalidCriteria.length > 0) {
      addFinding({
        code: "VISP.CONTRACT.CRITERION_MAPPING_MISSING",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "One or more task criterion mappings are absent or contradict their claim.",
        recommendation: "Regenerate criterion bindings without inventing replacement oracles.",
        evidence: invalidCriteria.map((criterion) => `${criterion.id}:${criterion.requirementId}`)
      });
    }
    if (
      duplicateRequirements.length > 0 ||
      duplicateCriteria.length > 0 ||
      crossFeatureRequirements.length > 0 ||
      invalidCriteria.length > 0
    ) {
      return {
        claims: notApplicable("no_active_task"),
        oracles: [],
        oracleOrder: []
      };
    }
    const oracles: ValidationOracle[] = source.acceptanceCriteria.map((criterion) => ({
      id: criterion.id,
      claimId: criterion.requirementId,
      statement: criterion.description,
      testable: criterion.testable,
      validationMethod: criterion.validationMethod
    }));
    const oracleOrder = oracles.map(({ id }) => id);
    oracles.sort((left, right) => compareUtf16CodeUnits(left.id, right.id));
    return {
      claims: notApplicable("no_active_task"),
      oracles,
      oracleOrder
    };
  }

  if (task.requirementIds.length === 0 && task.acceptanceCriterionIds.length === 0) {
    return { claims: available([]), oracles: [], oracleOrder: [] };
  }

  const source = state.contextPack ?? state.spec;
  if (source === undefined) {
    addFinding({
      code: "VISP.CONTRACT.CLAIM_SOURCE_MISSING",
      source: "contract",
      severity: "error",
      effect: "uncertain",
      message: "The selected task has claim bindings but no context or specification source.",
      recommendation: "Generate or restore the selected task context and specification.",
      evidence: [...task.requirementIds, ...task.acceptanceCriterionIds]
    });
    return { claims: unavailable("source_missing"), oracles: [], oracleOrder: [] };
  }

  const requirements = (
    "includedRequirements" in source ? source.includedRequirements : source.requirements
  ).filter((requirement) => task.requirementIds.includes(requirement.id));
  const criteria = (
    "includedAcceptanceCriteria" in source
      ? source.includedAcceptanceCriteria
      : source.acceptanceCriteria
  ).filter((criterion) => task.acceptanceCriterionIds.includes(criterion.id));
  const requirementIds = new Set(requirements.map((requirement) => requirement.id));
  const criterionIds = new Set(criteria.map((criterion) => criterion.id));
  const duplicateRequirements = duplicateValues(requirements.map((requirement) => requirement.id));
  const duplicateCriteria = duplicateValues(criteria.map((criterion) => criterion.id));
  const missingRequirements = task.requirementIds.filter((id) => !requirementIds.has(id));
  const missingCriteria = task.acceptanceCriterionIds.filter((id) => !criterionIds.has(id));
  const invalidCriteria = criteria.filter(
    (criterion) => !requirementIds.has(criterion.requirementId)
  );
  const crossFeatureRequirements = requirements.filter(
    (requirement) =>
      state.selectedFeature !== undefined && requirement.featureId !== state.selectedFeature.id
  );

  if (duplicateRequirements.length > 0 || duplicateCriteria.length > 0) {
    addFinding({
      code: "VISP.CONTRACT.CLAIM_MAPPING_DUPLICATE",
      source: "contract",
      severity: "error",
      effect: "uncertain",
      message: "Task claim sources contain duplicate stable IDs.",
      recommendation: "Regenerate the task claim source with one record per stable ID.",
      evidence: [
        ...duplicateRequirements.map((id) => `requirement:${id}`),
        ...duplicateCriteria.map((id) => `criterion:${id}`)
      ]
    });
  }
  if (crossFeatureRequirements.length > 0) {
    addFinding({
      code: "VISP.CONTRACT.REQUIREMENT_FEATURE_MISMATCH",
      source: "contract",
      severity: "error",
      effect: "uncertain",
      message: "One or more mapped requirements belong to another feature.",
      recommendation: "Regenerate task mappings from the active feature specification.",
      evidence: crossFeatureRequirements.map(
        (requirement) => `${requirement.id}:${requirement.featureId}`
      )
    });
  }

  if (missingRequirements.length > 0) {
    addFinding({
      code: "VISP.CONTRACT.REQUIREMENT_MAPPING_MISSING",
      source: "contract",
      severity: "error",
      effect: "uncertain",
      message: "One or more task requirement mappings are absent from the authoritative source.",
      recommendation: "Regenerate task mappings without inventing replacement requirements.",
      evidence: missingRequirements
    });
  }
  if (missingCriteria.length > 0 || invalidCriteria.length > 0) {
    addFinding({
      code: "VISP.CONTRACT.CRITERION_MAPPING_MISSING",
      source: "contract",
      severity: "error",
      effect: "uncertain",
      message: "One or more task criterion mappings are absent or contradict their claim.",
      recommendation: "Regenerate criterion bindings without inventing replacement oracles.",
      evidence: [
        ...missingCriteria,
        ...invalidCriteria.map((criterion) => `${criterion.id}:${criterion.requirementId}`)
      ]
    });
  }

  const sourceInvalid =
    duplicateRequirements.length > 0 ||
    duplicateCriteria.length > 0 ||
    crossFeatureRequirements.length > 0 ||
    missingRequirements.length > 0 ||
    missingCriteria.length > 0 ||
    invalidCriteria.length > 0;
  if (sourceInvalid) {
    return { claims: unavailable("source_invalid"), oracles: [], oracleOrder: [] };
  }

  const claims: RequirementClaim[] = requirements.map((requirement) => ({
    id: requirement.id,
    statement: requirement.description,
    priority: requirement.priority,
    acceptanceCriterionIds: sortedUnique(
      criteria
        .filter((criterion) => criterion.requirementId === requirement.id)
        .map((criterion) => criterion.id)
    ),
    accountableOwner: unavailable("not_in_source_artifact")
  }));
  claims.sort((left, right) => compareUtf16CodeUnits(left.id, right.id));

  const oracles: ValidationOracle[] = criteria.map((criterion) => ({
    id: criterion.id,
    claimId: criterion.requirementId,
    statement: criterion.description,
    testable: criterion.testable,
    validationMethod: criterion.validationMethod
  }));
  const oracleOrder = oracles.map(({ id }) => id);
  oracles.sort((left, right) => compareUtf16CodeUnits(left.id, right.id));

  return { claims: available(claims), oracles, oracleOrder };
}
