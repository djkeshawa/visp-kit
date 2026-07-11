import { type PlanDraftArtifact } from "../artifacts/schemas/plan.schema.js";
import { duplicateIds, validation } from "./validation-helpers.js";
import { type WorkflowValidation } from "../workflows/shared/workflow-summary.js";
import { concreteStrings, concreteText, hasConcreteCommand, placeholderFindings } from "./semantic-lint.js";

export function validatePlan(plan: PlanDraftArtifact): WorkflowValidation {
  const errors: string[] = [
    ...duplicateIds(
      plan.decisions.map((decision) => decision.id),
      "decision"
    ),
    ...duplicateIds(
      plan.risks.map((risk) => risk.id),
      "risk"
    )
  ];

  if (plan.status !== "ready") {
    errors.push("Plan must be marked ready before workflow advancement.");
  }
  errors.push(...placeholderFindings(plan, "plan"));

  errors.push(
    ...concreteText({ value: plan.implementationApproach, label: "implementationApproach" }),
    ...concreteText({ value: plan.rollbackStrategy, label: "rollbackStrategy" }),
    ...concreteStrings({ values: plan.evidence.knownFromSpecification, label: "evidence.knownFromSpecification" }),
    ...concreteStrings({ values: plan.evidence.knownFromCodebase, label: "evidence.knownFromCodebase" })
  );

  if (plan.implementationApproach.trim().length === 0) {
    errors.push("Plan must include an implementation approach.");
  }

  if (plan.testingStrategy.length === 0) {
    errors.push("Plan must include a testing strategy.");
  }

  if (!hasConcreteCommand(plan.testingStrategy.map((item) => item.validationCommand))) {
    errors.push("Plan must include at least one concrete validation command.");
  }

  for (const decision of plan.decisions) {
    errors.push(...concreteText({ value: decision.title, label: `${decision.id} title` }));
    errors.push(...concreteText({ value: decision.decision, label: `${decision.id} decision` }));
    errors.push(...concreteText({ value: decision.evidence, label: `${decision.id} evidence` }));
    if (decision.reason.trim().length === 0) {
      errors.push(`${decision.id} must include a reason.`);
    }
  }

  for (const risk of plan.risks) {
    errors.push(...concreteText({ value: risk.description, label: `${risk.id} description` }));
    errors.push(...concreteText({ value: risk.mitigation, label: `${risk.id} mitigation` }));
    if (risk.mitigation.trim().length === 0) {
      errors.push(`${risk.id} must include a mitigation.`);
    }
  }

  if (plan.dependencies.newDependenciesRequired && !plan.dependencies.requiresApproval) {
    errors.push("New dependency recommendations must require approval.");
  }

  return validation(errors);
}
