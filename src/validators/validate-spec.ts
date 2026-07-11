import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type TraceabilityMatrix } from "../artifacts/schemas/traceability.schema.js";
import { duplicateIds, validation } from "./validation-helpers.js";
import { type WorkflowValidation } from "../workflows/shared/workflow-summary.js";
import { concreteStrings, concreteText, isPlaceholderText, isTautologicalCriterion, placeholderFindings } from "./semantic-lint.js";

export function validateSpec(input: {
  readonly spec: SpecArtifact;
  readonly traceability?: TraceabilityMatrix;
}): WorkflowValidation {
  const requirementIds = input.spec.requirements.map((requirement) => requirement.id);
  const acceptanceCriterionIds = input.spec.acceptanceCriteria.map((criterion) => criterion.id);
  const requirementSet = new Set(requirementIds);
  const errors: string[] = [
    ...duplicateIds(requirementIds, "requirement"),
    ...duplicateIds(acceptanceCriterionIds, "acceptance criterion")
  ];

  if (input.spec.status !== "ready") {
    errors.push("Specification must be marked ready before workflow advancement.");
  }
  errors.push(...placeholderFindings(input.spec, "spec"));

  errors.push(
    ...concreteStrings({ values: input.spec.businessRules, label: "businessRules" }),
    ...concreteStrings({ values: input.spec.edgeCases, label: "edgeCases" }),
    ...concreteStrings({ values: input.spec.outOfScope, label: "outOfScope" })
  );

  if (input.spec.requirements.length === 0) {
    errors.push("Spec must include at least one requirement.");
  }

  for (const requirement of input.spec.requirements) {
    errors.push(...concreteText({ value: requirement.title, label: `${requirement.id} title` }));
    errors.push(...concreteText({ value: requirement.description, label: `${requirement.id} description` }));
    if (requirement.description.trim().length === 0) {
      errors.push(`${requirement.id} must have a description.`);
    }

    if (requirement.acceptanceCriteria.length === 0) {
      errors.push(`${requirement.id} must include at least one acceptance criterion.`);
    }
  }

  for (const criterion of input.spec.acceptanceCriteria) {
    if (!requirementSet.has(criterion.requirementId)) {
      errors.push(`${criterion.id} references missing requirement ${criterion.requirementId}.`);
    }

    if (criterion.description.trim().length === 0) {
      errors.push(`${criterion.id} must have a description.`);
    }

    if (isPlaceholderText(criterion.description)) {
      errors.push(`${criterion.id} contains placeholder text.`);
    }

    const requirement = input.spec.requirements.find((item) => item.id === criterion.requirementId);
    if (requirement !== undefined && isTautologicalCriterion({
      criterion: criterion.description,
      requirementTitle: requirement.title,
      requirementDescription: requirement.description
    })) {
      errors.push(`${criterion.id} must state an observable outcome rather than repeat its requirement.`);
    }
  }

  if (input.traceability !== undefined) {
    const tracedRequirements = new Set(
      input.traceability.entries.map((entry) => entry.requirementId)
    );
    const tracedCriteria = new Set(
      input.traceability.entries.flatMap((entry) => entry.acceptanceCriterionIds)
    );

    for (const requirementId of requirementIds) {
      if (!tracedRequirements.has(requirementId)) {
        errors.push(`Traceability is missing requirement ${requirementId}.`);
      }
    }

    for (const criterionId of acceptanceCriterionIds) {
      if (!tracedCriteria.has(criterionId)) {
        errors.push(`Traceability is missing acceptance criterion ${criterionId}.`);
      }
    }
  }

  return validation(errors);
}
