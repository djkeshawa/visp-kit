import { type PlanDraftArtifact } from "../artifacts/schemas/plan.schema.js";
import { duplicateIds, validation } from "./validation-helpers.js";
import { type WorkflowValidation } from "../workflows/shared/workflow-summary.js";

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

  if (plan.implementationApproach.trim().length === 0) {
    errors.push("Plan must include an implementation approach.");
  }

  if (plan.testingStrategy.length === 0) {
    errors.push("Plan must include a testing strategy.");
  }

  for (const decision of plan.decisions) {
    if (decision.reason.trim().length === 0) {
      errors.push(`${decision.id} must include a reason.`);
    }
  }

  for (const risk of plan.risks) {
    if (risk.mitigation.trim().length === 0) {
      errors.push(`${risk.id} must include a mitigation.`);
    }
  }

  if (plan.dependencies.newDependenciesRequired && !plan.dependencies.requiresApproval) {
    errors.push("New dependency recommendations must require approval.");
  }

  return validation(errors);
}
