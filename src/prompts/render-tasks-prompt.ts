import { type ActiveFeature } from "../workflows/shared/active-feature.js";
import { budgetInstruction, promptHeader } from "./prompt-common.js";

export function renderTasksPrompt(feature: ActiveFeature): string {
  return `${promptHeader("Visp Tasks Prompt", feature)}

Read:
- ${feature.relativePath}/spec.md
- ${feature.relativePath}/spec.json
- ${feature.relativePath}/plan.md
- ${feature.relativePath}/plan.json
- ${feature.relativePath}/traceability.md
- ${feature.relativePath}/traceability.json
- .visp/memory/project-summary.md if present
- .visp/memory/constitution.compact.md if present
- .visp/cache/test-map.json if present
- .visp/cache/file-summaries.json if present

Update:
- ${feature.relativePath}/tasks.md
- ${feature.relativePath}/task-graph.json
- ${feature.relativePath}/traceability.md
- ${feature.relativePath}/traceability.json

Rules:
- Create a small dependency-aware task graph.
- Every task must map to requirements and acceptance criteria.
- Include allowed files and validation commands where known.
- Prefer test-first tasks when behavior changes.
- Avoid broad refactors and unapproved dependencies.
- Keep each task implementation-sized.
- ${budgetInstruction(feature.intent.budgetMode)}
- Do not implement any task.
- Do not create context packs.

After editing, run:
visp tasks --validate
`;
}
