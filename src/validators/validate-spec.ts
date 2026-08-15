import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type TraceabilityMatrix } from "../artifacts/schemas/traceability.schema.js";
import { duplicateIds, validation } from "./validation-helpers.js";
import { type WorkflowValidation } from "../workflows/shared/workflow-summary.js";
import {
  concreteStrings,
  concreteText,
  isPlaceholderText,
  isTautologicalCriterion,
  placeholderFindings
} from "./semantic-lint.js";
import { blockingCriticFindings } from "./specification-critic.js";

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
  // P8-04. Only the blocking subset reaches this channel: findings whose
  // false-positive rate is zero by construction because they read a
  // contradiction between declared fields rather than judging prose.
  errors.push(...blockingCriticFindings(input.spec));

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
    errors.push(
      ...concreteText({ value: requirement.description, label: `${requirement.id} description` })
    );
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
      // One unfilled field, one instruction. The tautology check below reads
      // an unfilled description as a badly written one and adds "must state an
      // observable outcome rather than repeat its requirement" — a critique of
      // prose that does not exist yet, on the same field, in the same run.
      continue;
    }

    const requirement = input.spec.requirements.find((item) => item.id === criterion.requirementId);
    if (
      requirement !== undefined &&
      isTautologicalCriterion({
        criterion: criterion.description,
        requirementTitle: requirement.title,
        requirementDescription: requirement.description
      })
    ) {
      errors.push(
        `${criterion.id} must state an observable outcome rather than repeat its requirement.`
      );
    }
  }

  if (input.traceability !== undefined) {
    const tracedRequirements = new Set(
      input.traceability.entries.map((entry) => entry.requirementId)
    );
    const tracedCriteria = new Set(
      input.traceability.entries.flatMap((entry) => entry.acceptanceCriterionIds)
    );
    const missingRequirements = requirementIds.filter((id) => !tracedRequirements.has(id));

    // Traceability is deliberately not auto-extended: deciding that a
    // requirement is traced is the author's call, and silently writing the
    // entry would satisfy the check without anyone making that decision.
    // Printing the exact entry removes the guessing without removing the
    // decision.
    if (missingRequirements.length > 0) {
      const additions = missingRequirements.map((requirementId) => ({
        requirementId,
        acceptanceCriterionIds: input.spec.acceptanceCriteria
          .filter((criterion) => criterion.requirementId === requirementId)
          .map((criterion) => criterion.id),
        taskIds: [],
        filePaths: [],
        testPaths: [],
        status: "missing"
      }));

      errors.push(
        `Traceability is missing ${missingRequirements.join(", ")}. ` +
          `Append to "entries" in traceability.json:\n${JSON.stringify(additions, null, 2)}`
      );
    }

    // A criterion can be missing while its requirement is already traced. That
    // is a different repair — extend an existing entry rather than add one —
    // so it is reported separately instead of being folded into the above.
    const orphanedCriteria = input.spec.acceptanceCriteria.filter(
      (criterion) =>
        !tracedCriteria.has(criterion.id) && tracedRequirements.has(criterion.requirementId)
    );

    if (orphanedCriteria.length > 0) {
      const byRequirement = new Map<string, string[]>();

      for (const criterion of orphanedCriteria) {
        byRequirement.set(criterion.requirementId, [
          ...(byRequirement.get(criterion.requirementId) ?? []),
          criterion.id
        ]);
      }

      const repairs = [...byRequirement.entries()]
        .map(
          ([requirementId, ids]) =>
            `  ${requirementId}: add ${ids.join(", ")} to its acceptanceCriterionIds`
        )
        .join("\n");

      errors.push(
        `Traceability is missing acceptance criteria ` +
          `${orphanedCriteria.map((criterion) => criterion.id).join(", ")}.\n${repairs}`
      );
    }
  }

  return validation(errors);
}
