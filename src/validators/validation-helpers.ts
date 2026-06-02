import { type WorkflowValidation } from "../workflows/shared/workflow-summary.js";

export function validation(errors: readonly string[]): WorkflowValidation {
  return {
    passed: errors.length === 0,
    errors
  };
}

export function duplicateIds(
  values: readonly string[],
  label: string
): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }

    seen.add(value);
  }

  return [...duplicates].sort().map((id) => `Duplicate ${label} ID: ${id}.`);
}
