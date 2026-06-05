export const defaultNonOverridableRules = ["VSP019", "VSP020"] as const;

export function nonOverridableMessage(ruleId: string): string {
  if (ruleId === "VSP019") {
    return "VSP019 cannot be overridden because user prompts must never override Visp policy.";
  }

  if (ruleId === "VSP020") {
    return "VSP020 cannot be overridden because agents must stop on failed Visp gates.";
  }

  return `${ruleId} cannot be overridden.`;
}
