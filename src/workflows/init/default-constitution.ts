import {
  type BudgetMode,
  type Preset
} from "../../artifacts/schemas/common.schema.js";

const presetHints: Record<Preset, string> = {
  javascript: "Prefer clean JavaScript module boundaries and explicit data flow.",
  typescript: "Use TypeScript types clearly and keep runtime validation at boundaries.",
  electron: "Protect desktop app startup, IPC boundaries, and local data safety.",
  react: "Keep components focused, accessible, and consistent with existing UI structure.",
  "node-api": "Preserve API contracts and validate external input at service boundaries.",
  generic: "Follow the existing project conventions before adding new patterns."
};

const budgetHints: Record<BudgetMode, string> = {
  lean: "Use the smallest sufficient task-specific context and avoid extra AI calls.",
  balanced: "Use the normal spec, plan, task, and validation workflow.",
  strict: "Favor extra validation and risk checks for sensitive or high-impact work."
};

export function constitutionMarkdown(preset: Preset, budget: BudgetMode): string {
  return `# Visp Constitution

## Engineering Principles

- Keep functions small, specific, and readable.
- Prefer modular design and clean architecture where practical.
- Preserve the existing project style and conventions.
- Do not perform unrelated refactoring.
- Do not introduce dependencies without explicit approval.
- Write or update tests for behavior changes.
- Keep implementation work task-by-task and traceable.
- Map implementation tasks to requirements and acceptance criteria.
- Keep AI context task-specific and token-efficient.

## Preset Guidance

- ${presetHints[preset]}

## Budget Guidance

- ${budgetHints[budget]}
`;
}

export function compactConstitutionMarkdown(): string {
  return `# Compact Visp Constitution

C001: Keep functions small, specific, and readable.
C002: Follow existing project structure and conventions.
C003: Do not introduce dependencies without explicit approval.
C004: Write or update tests for behavior changes.
C005: Avoid unrelated refactoring.
C006: Keep AI context task-specific and token-efficient.
C007: Every implementation task should map to requirements and acceptance criteria.
`;
}

export function placeholderMemoryMarkdown(title: string): string {
  return `# ${title}

This file is a placeholder. Future phases such as \`visp scan\` will populate it with project-specific context.
`;
}

export function placeholderReportMarkdown(title: string): string {
  return `# ${title}

No report has been generated yet. Future Visp Kit phases will populate this file.
`;
}

export function genericAgentGuidanceMarkdown(
  preset: Preset,
  budget: BudgetMode
): string {
  return `# Visp Agent Guidance

- Respect \`.visp/memory/constitution.md\`.
- Keep work small, scoped, and traceable to Visp artifacts.
- Use compact context where possible.
- Preset guidance: ${presetHints[preset]}
- Budget guidance: ${budgetHints[budget]}
`;
}
