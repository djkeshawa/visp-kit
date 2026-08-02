import { type ActiveFeature } from "../workflows/shared/active-feature.js";
import { clarifyFieldValuesSection, editSeededJsonInstruction } from "./artifact-examples.js";
import { budgetInstruction, promptHeader } from "./prompt-common.js";

export function renderClarifyPrompt(feature: ActiveFeature): string {
  return `${promptHeader("Visp Clarify Prompt", feature)}

Read:
- ${feature.relativePath}/intent.md
- ${feature.relativePath}/intent.json
- .visp/memory/constitution.compact.md if present
- .visp/memory/project-summary.md if present

Update:
- ${feature.relativePath}/clarifications.json

Generated (do not edit):
- ${feature.relativePath}/clarifications.md

Rules:
- Ask only blocking implementation-relevant questions.
- Provide recommended defaults.
- Mark safe assumptions.
- Set status to "ready" only after every blocking question is answered or its recommended default is explicitly accepted.
- ${editSeededJsonInstruction}
- The files under Generated are rendered from the JSON by \`visp-kit clarify --validate\`; edits to them are discarded.
- ${budgetInstruction(feature.intent.budgetMode)}
- Do not implement code.
- Do not create spec, plan, or tasks.
- Keep output compact.

${clarifyFieldValuesSection()}

After editing, run:
visp-kit clarify --validate
`;
}
