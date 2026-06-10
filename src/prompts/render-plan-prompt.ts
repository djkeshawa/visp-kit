import { type ActiveFeature } from "../workflows/shared/active-feature.js";
import { editSeededJsonInstruction, planFieldValuesSection } from "./artifact-examples.js";
import { budgetInstruction, promptHeader } from "./prompt-common.js";

export function renderPlanPrompt(feature: ActiveFeature): string {
  return `${promptHeader("Visp Plan Prompt", feature)}

Read:
- ${feature.relativePath}/spec.md
- ${feature.relativePath}/spec.json
- .visp/project.json if present
- .visp/memory/project-summary.md if present
- .visp/memory/patterns.md if present
- .visp/memory/constitution.compact.md if present
- .visp/cache/file-index.json if present
- .visp/cache/module-map.json if present
- .visp/cache/dependency-map.json if present

Update:
- ${feature.relativePath}/plan.md
- ${feature.relativePath}/plan.json

Rules:
- Produce a practical implementation plan.
- Distinguish known user/spec/codebase/constitution evidence from inferred, assumed, and unknown items.
- Do not implement code.
- Do not generate tasks.
- Do not invent codebase facts without evidence.
- Mark missing codebase evidence as unknown.
- Avoid broad refactors and unapproved dependencies.
- ${editSeededJsonInstruction}
- ${budgetInstruction(feature.intent.budgetMode)}

${planFieldValuesSection()}

After editing, run:
visp plan --validate
`;
}
