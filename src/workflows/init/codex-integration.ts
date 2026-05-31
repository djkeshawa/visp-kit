import path from "node:path";

import {
  type BudgetMode,
  type Preset
} from "../../artifacts/schemas/common.schema.js";

export type CodexFile = {
  readonly path: string;
  readonly contents: string;
};

type SkillDefinition = {
  readonly name: string;
  readonly title: string;
  readonly purpose: string;
  readonly whenToUse: string;
  readonly inputs: string;
  readonly outputs: string;
  readonly constraints: readonly string[];
};

const skillDefinitions: readonly SkillDefinition[] = [
  {
    name: "visp-orchestrator",
    title: "Visp Orchestrator",
    purpose: "Read Visp status and recommend the next workflow step.",
    whenToUse: "Use when deciding what Visp workflow action should happen next.",
    inputs: ".visp/status.json and available Visp artifacts.",
    outputs: "A concise next-step recommendation.",
    constraints: ["Keep work inside the Visp Kit workflow."]
  },
  {
    name: "visp-clarify",
    title: "Visp Clarify",
    purpose: "Find blocking ambiguity before implementation planning.",
    whenToUse: "Use when a feature idea lacks implementation-relevant details.",
    inputs: "Feature intent, project constitution, and existing notes.",
    outputs: "Only useful clarification questions.",
    constraints: ["Ask blocking questions first.", "Avoid broad product brainstorming."]
  },
  {
    name: "visp-specify",
    title: "Visp Specify",
    purpose: "Convert a feature idea into requirements and acceptance criteria.",
    whenToUse: "Use after blocking ambiguity is resolved.",
    inputs: "Feature intent and clarifications.",
    outputs: "Requirements and testable acceptance criteria.",
    constraints: ["Avoid premature implementation details."]
  },
  {
    name: "visp-plan",
    title: "Visp Plan",
    purpose: "Create a practical implementation plan from a Visp spec.",
    whenToUse: "Use when requirements are ready for engineering planning.",
    inputs: "Spec artifacts, constitution, and project context.",
    outputs: "A scoped implementation plan with decisions and risks.",
    constraints: ["Use existing project conventions."]
  },
  {
    name: "visp-task-graph",
    title: "Visp Task Graph",
    purpose: "Break a plan into small dependency-aware tasks.",
    whenToUse: "Use after a plan is accepted.",
    inputs: "Plan, requirements, and acceptance criteria.",
    outputs: "Traceable task graph entries.",
    constraints: ["Keep each task small.", "Map tasks to requirements."]
  },
  {
    name: "visp-implement-task",
    title: "Visp Implement Task",
    purpose: "Implement one Visp task at a time.",
    whenToUse: "Use when a task-specific context pack is available.",
    inputs: "Task, context pack, and validation commands.",
    outputs: "A focused code change and validation result.",
    constraints: ["Avoid unrelated changes.", "Use only task-specific context."]
  },
  {
    name: "visp-review-diff",
    title: "Visp Review Diff",
    purpose: "Review changed diff against task scope and requirements.",
    whenToUse: "Use after implementation and before reconciliation.",
    inputs: "Diff, task scope, requirements, and acceptance criteria.",
    outputs: "Findings about bugs, scope creep, or missing tests.",
    constraints: ["Review the diff first.", "Flag missing validation."]
  },
  {
    name: "visp-reconcile",
    title: "Visp Reconcile",
    purpose: "Compare spec, plan, tasks, and actual implementation.",
    whenToUse: "Use after verification or review.",
    inputs: "Spec, plan, task graph, diff, and verification notes.",
    outputs: "Drift findings and follow-up work.",
    constraints: ["Do not hide drift.", "Keep follow-up tasks traceable."]
  }
];

export function codexAgentsMarkdown(preset: Preset, budget: BudgetMode): string {
  return `# AGENTS.md

Guidance for Codex working in this repository with Visp Kit.

- Respect \`.visp/memory/constitution.md\`.
- Use compact context from \`.visp\` artifacts where possible.
- Do not implement broad changes without a scoped Visp task.
- Keep changes small and traceable to requirements and acceptance criteria.
- Run relevant tests, type checks, or build commands before reporting completion.
- Preset: ${preset}.
- Budget mode: ${budget}.
`;
}

function skillMarkdown(skill: SkillDefinition): string {
  return `---
name: ${skill.name}
description: "${skill.purpose}"
---

# ${skill.title}

## Purpose

${skill.purpose}

## When To Use

${skill.whenToUse}

## Inputs

${skill.inputs}

## Outputs

${skill.outputs}

## Constraints

${skill.constraints.map((constraint) => `- ${constraint}`).join("\n")}
- Reference \`.visp\` artifacts when available.
- Do not assume future Visp commands are already implemented.
`;
}

export function codexSkillFiles(rootPath: string): readonly CodexFile[] {
  return skillDefinitions.map((skill) => ({
    path: path.join(rootPath, ".agents", "skills", skill.name, "SKILL.md"),
    contents: skillMarkdown(skill)
  }));
}
