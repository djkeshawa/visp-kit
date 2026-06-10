import { type StrictnessMode } from "../../artifacts/schemas/policy.schema.js";
import {
  blockingRulesSection,
  completionCriteriaSection,
  gateReadingSection,
  implementationRulesSection,
  strictPolicySection
} from "./shared-agent-rules.js";

export function renderVispRulesFile(strictness: StrictnessMode): string {
  return `# Visp Kit Workflow Rules

These rules apply to every Visp workflow. Workflow files reference this document through their rules digest.

${strictPolicySection(strictness)}
${implementationRulesSection()}
${blockingRulesSection()}
${completionCriteriaSection()}
${gateReadingSection()}`;
}
