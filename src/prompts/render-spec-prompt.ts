import { type ActiveFeature } from "../workflows/shared/active-feature.js";
import { editSeededJsonInstruction, specFieldValuesSection } from "./artifact-examples.js";
import { budgetInstruction, promptHeader } from "./prompt-common.js";

export function renderSpecPrompt(feature: ActiveFeature): string {
  return `${promptHeader("Visp Spec Prompt", feature)}

Read:
- ${feature.relativePath}/intent.md
- ${feature.relativePath}/intent.json
- ${feature.relativePath}/clarifications.md
- ${feature.relativePath}/clarifications.json
- .visp/memory/constitution.compact.md if present

Update:
- ${feature.relativePath}/spec.md
- ${feature.relativePath}/spec.json
- ${feature.relativePath}/traceability.md
- ${feature.relativePath}/traceability.json

Rules:
- Produce requirements and acceptance criteria.
- Describe what and why, not how.
- Do not include implementation details unless explicitly required by the user.
- Keep requirements testable.
- ${editSeededJsonInstruction}
- ${budgetInstruction(feature.intent.budgetMode)}
- Do not implement code.
- Do not create plan or tasks.

${specFieldValuesSection()}

After editing, run:
visp spec --validate
`;
}
