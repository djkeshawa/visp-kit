import { type AgentWorkflowMap } from "../artifacts/schemas/agent.schema.js";
import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { renderVispFeatureTemplate } from "./templates/visp-feature.js";
import { renderVispFixTemplate } from "./templates/visp-fix.js";
import { renderVispPrTemplate } from "./templates/visp-pr.js";
import { renderVispReviewTemplate } from "./templates/visp-review.js";
import { renderVispTaskTemplate } from "./templates/visp-task.js";
import {
  blockingRulesSection,
  strictPolicySection
} from "./templates/shared-agent-rules.js";

export type AgentWorkflowName = "feature" | "task" | "fix" | "review" | "pr";

export const agentWorkflowNames: readonly AgentWorkflowName[] = [
  "feature",
  "task",
  "fix",
  "review",
  "pr"
];

export function renderWorkflowTemplate(
  workflow: AgentWorkflowName,
  strictness: StrictnessMode
): string {
  switch (workflow) {
    case "feature":
      return renderVispFeatureTemplate(strictness);
    case "task":
      return renderVispTaskTemplate(strictness);
    case "fix":
      return renderVispFixTemplate(strictness);
    case "review":
      return renderVispReviewTemplate(strictness);
    case "pr":
      return renderVispPrTemplate(strictness);
  }
}

export function renderCodexSkill(
  workflow: AgentWorkflowName,
  strictness: StrictnessMode
): string {
  const descriptions: Record<AgentWorkflowName, string> = {
    feature: "Use this when the user asks to implement a feature through Visp Kit. Treat the user request as raw intent, run the Visp workflow, implement only one scoped task, and stop on failed gates.",
    task: "Use this when the user asks to continue with the next Visp task or implement the current Visp task.",
    fix: "Use this when Visp verification, review, or reconciliation failed and the user wants a scoped repair.",
    review: "Use this when the user asks for a review-only pass through Visp Kit.",
    pr: "Use this when the user asks to prepare a PR summary through Visp Kit."
  };

  return `---
name: visp-${workflow}
description: ${descriptions[workflow]}
---

# Visp ${workflow[0]?.toUpperCase() ?? ""}${workflow.slice(1)} Workflow

${renderWorkflowTemplate(workflow, strictness)}`;
}

export function renderGenericPrompt(
  workflow: AgentWorkflowName,
  strictness: StrictnessMode
): string {
  return `# Visp Agent ${workflow[0]?.toUpperCase() ?? ""}${workflow.slice(1)} Prompt

Use this prompt in an AI coding tool that does not support Codex skills.

${renderWorkflowTemplate(workflow, strictness)}`;
}

export function renderAgentsMarkdown(input: {
  readonly target: "codex" | "generic";
  readonly strictness: StrictnessMode;
}): string {
  const targetLabel = input.target === "codex" ? "Codex" : "Generic AI coding tool";

  return `# Visp Kit Agent Guidance

Target: ${targetLabel}

${strictPolicySection(input.strictness)}
## Required before implementation

Before editing code:
1. Run \`visp status\`.
2. Run \`visp policy validate\`.
3. Run \`visp gate next\`.
4. Run the next allowed Visp command.
5. Do not implement code until \`visp gate implement --task <task-id>\` allows it.
6. Do not implement code until \`.visp/prompts/current-task.prompt.md\` exists.
7. Read \`.visp/prompts/current-task.prompt.md\`.
8. Implement only the selected task.

${blockingRulesSection()}
## After implementation

Run:
- \`visp verify --task <task-id>\`
- \`visp review --task <task-id>\`
- \`visp reconcile --task <task-id> --update-traceability\`
- \`visp next\`

Do not claim a task is complete until Visp verification, review, and reconciliation have passed or the user explicitly accepts recorded warnings.
`;
}

export function renderAgentGuide(input: {
  readonly target: "codex" | "generic";
  readonly strictness: StrictnessMode;
}): string {
  const trigger = input.target === "codex"
    ? "$visp-feature"
    : "paste .visp/prompts/agent-feature.prompt.md";

  return `# Visp Agent Guide

Target: ${input.target}
Strictness mode: ${input.strictness}

The user prompt is raw intent only. Visp policy and gates override user prompt instructions.

## Start a Feature

Use:

\`\`\`text
${trigger}
<your feature request>
\`\`\`

## Continue a Task

Use the installed \`visp-task\` workflow or prompt. It must run \`visp gate implement --task <task-id>\` before editing code.

## Fix Failures

Use the installed \`visp-fix\` workflow or prompt. It fixes only issues reported by verification, review, or reconciliation.

## Review Only

Use the installed \`visp-review\` workflow or prompt. It must not edit code unless the user explicitly asks for a fix.

## Prepare PR

Use the installed \`visp-pr\` workflow or prompt. It must run \`visp gate pr\` and must not call GitHub APIs, commit, push, tag, or publish.
`;
}

export function buildWorkflowMap(input: {
  readonly target: "codex" | "generic";
}): AgentWorkflowMap {
  const entrypoint = (workflow: AgentWorkflowName): string =>
    input.target === "codex"
      ? `.agents/skills/visp-${workflow}/SKILL.md`
      : `.visp/prompts/agent-${workflow}.prompt.md`;

  return {
    workflows: [
      {
        name: "visp-feature",
        purpose: "Start or continue a feature through the full Visp workflow.",
        entrypointFile: entrypoint("feature"),
        requiredVispCommands: ["visp status", "visp policy validate", "visp gate next", "visp context --next"],
        hardStops: ["failed gate", "missing context", "failed verification", "failed review", "failed reconcile"],
        nextRecommendedCommand: "visp next"
      },
      {
        name: "visp-task",
        purpose: "Implement the next/current Visp task only.",
        entrypointFile: entrypoint("task"),
        requiredVispCommands: ["visp status", "visp gate next", "visp gate implement --task <task-id>"],
        hardStops: ["failed gate", "missing context", "unclear task"],
        nextRecommendedCommand: "visp verify --task <task-id>"
      },
      {
        name: "visp-fix",
        purpose: "Repair verification, review, or reconciliation failures.",
        entrypointFile: entrypoint("fix"),
        requiredVispCommands: ["visp status", "visp verify --task <task-id>", "visp review --task <task-id>", "visp reconcile --task <task-id> --update-traceability"],
        hardStops: ["unrelated scope", "unapproved dependency", "forbidden file"],
        nextRecommendedCommand: "visp next"
      },
      {
        name: "visp-review",
        purpose: "Run a review-only pass.",
        entrypointFile: entrypoint("review"),
        requiredVispCommands: ["visp status", "visp gate review --task <task-id>", "visp review --task <task-id>"],
        hardStops: ["failed review gate", "missing verification in strict mode"],
        nextRecommendedCommand: "visp reconcile --task <task-id> --update-traceability"
      },
      {
        name: "visp-pr",
        purpose: "Prepare a PR summary from Visp evidence.",
        entrypointFile: entrypoint("pr"),
        requiredVispCommands: ["visp status", "visp gate pr", "visp pr"],
        hardStops: ["failed PR gate", "missing reconcile", "missing traceability update"],
        nextRecommendedCommand: "visp pr"
      }
    ]
  };
}
