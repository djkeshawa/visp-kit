import { type ClarificationArtifact } from "../artifacts/schemas/clarification.schema.js";
import { duplicateIds, validation } from "./validation-helpers.js";
import { type WorkflowValidation } from "../workflows/shared/workflow-summary.js";
import { concreteText, placeholderFindings } from "./semantic-lint.js";

export function validateClarifications(artifact: ClarificationArtifact): WorkflowValidation {
  const errors: string[] = [
    ...duplicateIds(
      artifact.questions.map((question) => question.id),
      "question"
    ),
    ...duplicateIds(
      artifact.assumptions.map((assumption) => assumption.id),
      "assumption"
    )
  ];

  if (artifact.status !== "ready") {
    errors.push("Clarifications must be marked ready before workflow advancement.");
  }
  errors.push(...placeholderFindings(artifact, "clarifications"));

  for (const question of artifact.questions) {
    errors.push(...concreteText({ value: question.question, label: question.id }));
    errors.push(...concreteText({ value: question.reason, label: `${question.id} reason` }));
    errors.push(...concreteText({ value: question.recommendedDefault, label: `${question.id} recommended default` }));
    if (question.blocking && question.question.trim().length === 0) {
      errors.push(`${question.id} is blocking and must have question text.`);
    }

    if (question.blocking && question.reason.trim().length === 0) {
      errors.push(`${question.id} is blocking and must have a reason.`);
    }

    if (
      question.blocking &&
      question.status === "unanswered" &&
      question.recommendedDefault.trim().length === 0
    ) {
      errors.push(`${question.id} needs a recommended default.`);
    }

    if (question.status === "answered" && question.answer.trim().length === 0) {
      errors.push(`${question.id} is answered but has no answer text.`);
    }

    if (question.blocking && question.status === "unanswered") {
      errors.push(`${question.id} is blocking and unresolved.`);
    }
  }

  return validation(errors);
}
