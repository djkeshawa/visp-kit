export const defaultNonOverridableRules = ["VSP019", "VSP020", "VSP023"] as const;

export function nonOverridableMessage(ruleId: string): string {
  if (ruleId === "VSP019") {
    return "VSP019 cannot be overridden because user prompts must never override Visp policy.";
  }

  if (ruleId === "VSP020") {
    return "VSP020 cannot be overridden because agents must stop on failed Visp gates.";
  }

  if (ruleId === "VSP023") {
    return "VSP023 cannot be overridden because implementation authorization must bind current assurance inputs.";
  }

  return `${ruleId} cannot be overridden.`;
}
