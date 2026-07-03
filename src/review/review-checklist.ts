import { type ReviewReport } from "../artifacts/schemas/review.schema.js";

function checkboxItems(items: readonly string[]): string {
  return items.map((item) => `- [ ] ${item}`).join("\n");
}

export function renderReviewChecklist(report: ReviewReport): string {
  const securityItems = report.securityChecklist.map((item) => item.text);

  return `# Review Checklist: ${report.taskId ?? "feature-level"}

## Scope

${checkboxItems([
  "Changed files are allowed or justified.",
  "No forbidden files were changed.",
  "No unrelated refactoring was added."
])}

## Requirements

${checkboxItems([
  "Task maps to valid requirements.",
  "Acceptance criteria are addressed.",
  "No extra behavior was introduced outside the spec."
])}

## Tests

${checkboxItems([
  "Relevant tests were added or updated.",
  "Validation commands passed.",
  "Manual/static validation is documented where applicable."
])}

## Dependencies

${checkboxItems([
  "No dependency changes were made, or they are explicitly approved.",
  "Lockfile changes are expected."
])}

## Security and Privacy

${checkboxItems(securityItems)}

## Final Decision

${checkboxItems(["Ready to reconcile", "Needs changes", "Blocked"])}
`;
}
