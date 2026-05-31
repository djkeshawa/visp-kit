import {
  type BudgetMode,
  type Preset
} from "../artifacts/schemas/common.schema.js";
import { type ProjectProfile } from "../artifacts/schemas/project.schema.js";
import { budgetGuidance, presetGuidance } from "./constitution-presets.js";
import { type ConstitutionRule } from "./constitution-rules.js";

export type ConstitutionRenderInput = {
  readonly generatedAt: string;
  readonly preset: Preset;
  readonly budget: BudgetMode;
  readonly rules: readonly ConstitutionRule[];
  readonly project?: ProjectProfile;
  readonly projectSummary?: string;
};

function list(items: readonly string[]): string {
  return items.length === 0
    ? "- None detected yet."
    : items.map((item) => `- ${item}`).join("\n");
}

function ruleList(
  rules: readonly ConstitutionRule[],
  category: ConstitutionRule["category"]
): string {
  return list(
    rules
      .filter((rule) => rule.category === category)
      .map((rule) => `${rule.id}: ${rule.text}`)
  );
}

function projectSummaryExcerpt(summary: string | undefined): string {
  if (summary === undefined) {
    return "- No project summary is available yet.";
  }

  const lines = summary
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .slice(0, 4);

  return list(lines.length > 0 ? lines : ["Project summary is present."]);
}

export function renderCompactConstitution(
  rules: readonly ConstitutionRule[]
): string {
  return `${rules.map((rule) => `${rule.id}: ${rule.text}`).join("\n")}\n`;
}

export function renderFullConstitution(input: ConstitutionRenderInput): string {
  const projectName = input.project?.name ?? "Visp Kit Project";
  const detected = input.project
    ? [
        `Package manager: ${input.project.packageManager}`,
        `Languages: ${input.project.languages.join(", ") || "None detected yet"}`,
        `Frameworks: ${input.project.frameworks.join(", ") || "None detected yet"}`
      ]
    : ["Project scan data is not available yet."];

  return `# ${projectName} Constitution

Generated: ${input.generatedAt}
Preset: ${input.preset}
Budget mode: ${input.budget}

## Purpose

This constitution defines how AI-assisted work should be planned, implemented, and reviewed in this project.

## Project Context

${list(detected)}

## Existing Project Summary

${projectSummaryExcerpt(input.projectSummary)}

## Core Engineering Principles

${ruleList(input.rules, "base")}

## Architecture Principles

- Prefer modular design and clear ownership boundaries.
- Follow the existing structure before introducing new patterns.
- Keep UI, domain, persistence, and integration concerns separated where practical.

## Implementation Principles

- Keep functions small, specific, and readable.
- Prefer simple deterministic logic over clever abstractions.
- Avoid unrelated refactoring.

## Testing Principles

- Write or update tests for behavior changes.
- Run relevant validation commands before reporting completion.
- Use deterministic local checks before relying on manual review.

## Dependency Principles

- Do not add dependencies without explicit approval.
- Prefer existing project utilities and conventions.
- Keep dependency changes traceable to a task.

## Security And Privacy Principles

- Treat external input, file-system access, credentials, and IPC/API boundaries carefully.
- Keep sensitive data out of generated context unless explicitly required.
- Prefer narrow interfaces over broad access.

## Token Efficiency

${list(budgetGuidance[input.budget])}

## AI Workflow Rules

- Implement one scoped task at a time.
- Do not make broad changes without a Visp task.
- Keep context packs small and task-specific.
- Review diffs against task scope and requirements.

## Traceability

- Every implementation task should map to requirements and acceptance criteria.
- Validation results should be connected to the work they prove.
- Follow-up work should be tracked instead of hidden.

## Preset Guidance

${list(presetGuidance[input.preset].guidance)}

## Budget-Specific Compact Rules

${ruleList(input.rules, "budget")}

## Preset-Specific Compact Rules

${ruleList(input.rules, "preset")}

## Compact Rules

The compact constitution is stored at \`.visp/memory/constitution.compact.md\`.

${input.rules.map((rule) => `- ${rule.id}`).join("\n")}
`;
}
