import { type BudgetMode } from "../artifacts/schemas/common.schema.js";
import { type ActiveFeature } from "../workflows/shared/active-feature.js";

export function budgetInstruction(budget: BudgetMode): string {
  if (budget === "lean") {
    return "Keep artifacts compact and avoid verbose rationale.";
  }

  if (budget === "strict") {
    return "Include stronger risk, security, and testing detail where relevant.";
  }

  return "Use moderate detail and keep rationale focused.";
}

export function promptHeader(title: string, feature: ActiveFeature): string {
  return `# ${title}

You are helping refine the active Visp Kit feature.

Feature path:
${feature.relativePath}
`;
}
