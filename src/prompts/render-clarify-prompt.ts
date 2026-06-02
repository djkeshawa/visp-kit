import { type ActiveFeature } from "../workflows/shared/active-feature.js";
import { budgetInstruction, promptHeader } from "./prompt-common.js";

export function renderClarifyPrompt(feature: ActiveFeature): string {
  return `${promptHeader("Visp Clarify Prompt", feature)}

Read:
- ${feature.relativePath}/intent.md
- ${feature.relativePath}/intent.json
- .visp/memory/constitution.compact.md if present
- .visp/memory/project-summary.md if present

Update:
- ${feature.relativePath}/clarifications.md
- ${feature.relativePath}/clarifications.json

Rules:
- Ask only blocking implementation-relevant questions.
- Provide recommended defaults.
- Mark safe assumptions.
- ${budgetInstruction(feature.intent.budgetMode)}
- Do not implement code.
- Do not create spec, plan, or tasks.
- Keep output compact.

After editing, run:
visp clarify --validate
`;
}
