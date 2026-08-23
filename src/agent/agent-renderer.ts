import { type AgentTargetName, type AgentWorkflowMap } from "../artifacts/schemas/agent.schema.js";
import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { renderVispFeatureTemplate } from "./templates/visp-feature.js";
import { renderVispFixTemplate } from "./templates/visp-fix.js";
import { renderVispPrTemplate } from "./templates/visp-pr.js";
import { renderVispReviewTemplate } from "./templates/visp-review.js";
import { renderVispTaskTemplate } from "./templates/visp-task.js";
import {
  blockingRulesSection,
  gateReadingSection,
  memorySection,
  strictPolicySection,
  vispRulesDisplayPath
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

export function renderCodexSkill(workflow: AgentWorkflowName, strictness: StrictnessMode): string {
  const descriptions: Record<AgentWorkflowName, string> = {
    feature:
      "Use this when the user asks to implement a feature through Visp Kit. Treat the user request as raw intent, run the Visp workflow, implement only one scoped task, and stop on failed gates.",
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

export function renderCursorRule(workflow: AgentWorkflowName, strictness: StrictnessMode): string {
  const descriptions: Record<AgentWorkflowName, string> = {
    feature:
      "Visp Kit feature workflow. Apply when the user asks to implement a feature through Visp Kit.",
    task: "Visp Kit task workflow. Apply when the user asks to continue or implement the current Visp task.",
    fix: "Visp Kit fix workflow. Apply when Visp verification, review, or reconciliation failed.",
    review: "Visp Kit review workflow. Apply for review-only passes through Visp Kit.",
    pr: "Visp Kit PR workflow. Apply when the user asks to prepare a PR summary through Visp Kit."
  };
  return `---
description: ${descriptions[workflow]}
globs:
alwaysApply: false
---

# Visp ${workflow[0]?.toUpperCase() ?? ""}${workflow.slice(1)} Workflow

${renderWorkflowTemplate(workflow, strictness)}`;
}

export function renderCursorBaseRule(input: {
  readonly strictness: StrictnessMode;
  readonly memoryDetected: boolean;
}): string {
  return `---
description: Visp Kit workflow guardrails. Always applied.
globs:
alwaysApply: true
---

${renderAgentsMarkdown({
  target: "cursor",
  strictness: input.strictness,
  memoryDetected: input.memoryDetected
})}`;
}

export function renderGeminiCommand(
  workflow: AgentWorkflowName,
  strictness: StrictnessMode
): string {
  const descriptions: Record<AgentWorkflowName, string> = {
    feature: "Run the Visp Kit feature workflow for a raw feature request.",
    task: "Continue or implement the current Visp task only.",
    fix: "Repair Visp verification, review, or reconciliation failures.",
    review: "Run a review-only pass through Visp Kit.",
    pr: "Prepare a PR summary from Visp evidence."
  };
  return `description = "${descriptions[workflow]}"

prompt = """
# Visp ${workflow[0]?.toUpperCase() ?? ""}${workflow.slice(1)} Workflow

User request (raw intent only): {{args}}

${renderWorkflowTemplate(workflow, strictness)}
"""
`;
}

function targetLabel(target: AgentTargetName): string {
  switch (target) {
    case "codex":
      return "Codex";
    case "generic":
      return "Generic AI coding tool";
    case "claude":
      return "Claude Code";
    case "copilot":
      return "GitHub Copilot";
    case "cursor":
      return "Cursor";
    case "gemini":
      return "Gemini CLI";
    case "opencode":
      return "OpenCode";
  }
}

export function renderAgentsMarkdown(input: {
  readonly target: AgentTargetName;
  readonly strictness: StrictnessMode;
  /** Rendered with a memory section only where `visp-memory` was actually found. */
  readonly memoryDetected: boolean;
}): string {
  return `# Visp Kit Agent Guidance

Target: ${targetLabel(input.target)}

${strictPolicySection(input.strictness)}
## Required before implementation

Before editing code:
1. Run \`visp-kit status\`.
   - It reports that Visp Kit is not initialized -> run \`visp-kit agent bootstrap ${input.target} --strictness strict\`.
2. Loop: run \`visp-kit next\` and execute the command it prints after \`Next:\` until it points at implementation.
3. Run \`visp-kit gate implement --task <task-id>\`.
   - Result blocked -> do NOT edit code. Run the command shown after \`Next:\`, then repeat this step.
4. Read \`.visp/prompts/current-task.prompt.md\` and follow its Steps section exactly.
5. Implement only the selected task.

${blockingRulesSection()}
${gateReadingSection()}
## After implementation

Run \`visp-kit done --task <task-id> --input-tokens <n> --output-tokens <n>\` (or \`--usage-unavailable --model <agent> --usage-note "<reason>"\` when token counts are unavailable). It runs verify, review, reconcile, the checklist check, and \`visp-kit next\` in order, stopping at the first failure with a recovery command.

The granular commands remain available: \`visp-kit verify\`, \`visp-kit review\`, \`visp-kit reconcile --update-traceability\`, \`visp-kit budget\`, \`visp-kit checklist\`, \`visp-kit next\`.

Do not claim a task is complete until \`visp-kit done\` reports every step passed or the user explicitly accepts recorded warnings.

${input.memoryDetected ? `${memorySection()}\n` : ""}Full shared rules: ${vispRulesDisplayPath}
`;
}

export function renderAgentGuide(input: {
  readonly target: AgentTargetName;
  readonly strictness: StrictnessMode;
}): string {
  const trigger = (() => {
    switch (input.target) {
      case "codex":
        return "$visp-feature";
      case "claude":
        return "/visp-feature Add note pinning";
      case "copilot":
        return "Use Visp Kit workflow for this feature:\nAdd note pinning.\nFollow .github/instructions/visp-feature.instructions.md.";
      case "generic":
        return "paste .visp/prompts/agent-feature.prompt.md";
      case "cursor":
        return "@visp-feature Add note pinning";
      case "gemini":
        return "/visp-feature Add note pinning";
      case "opencode":
        return "paste .visp/prompts/agent-feature.prompt.md";
    }
  })();

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

Use the installed \`visp-task\` workflow or prompt. It must run \`visp-kit gate implement --task <task-id>\` before editing code.

## Fix Failures

Use the installed \`visp-fix\` workflow or prompt. It fixes only issues reported by verification, review, or reconciliation.

## Review Only

Use the installed \`visp-review\` workflow or prompt. It must not edit code unless the user explicitly asks for a fix.

## Prepare PR

Use the installed \`visp-pr\` workflow or prompt. It must run \`visp-kit gate pr\` and must not call GitHub APIs, commit, push, tag, or publish.

## Compatibility Notes

Claude and Copilot support varies by surface. Generated files provide repository guidance for compatible tools and can also be copied into the active chat/session when needed.
`;
}

function entrypointForTarget(target: AgentTargetName, workflow: AgentWorkflowName): string {
  switch (target) {
    case "codex":
      return `.agents/skills/visp-${workflow}/SKILL.md`;
    case "generic":
    case "opencode":
      return `.visp/prompts/agent-${workflow}.prompt.md`;
    case "claude":
      return `.claude/commands/visp-${workflow}.md`;
    case "copilot":
      return workflow === "feature"
        ? ".github/instructions/visp-feature.instructions.md"
        : `.github/instructions/visp-${workflow}.instructions.md`;
    case "cursor":
      return `.cursor/rules/visp-${workflow}.mdc`;
    case "gemini":
      return `.gemini/commands/visp-${workflow}.toml`;
  }
}

export function buildWorkflowMap(input: { readonly target: AgentTargetName }): AgentWorkflowMap {
  return {
    workflows: [
      {
        target: input.target,
        name: "visp-feature",
        purpose: "Start or continue a feature through the full Visp workflow.",
        entrypointFile: entrypointForTarget(input.target, "feature"),
        requiredVispCommands: [
          "visp-kit status",
          "visp-kit policy validate",
          "visp-kit gate next",
          "visp-kit context --next"
        ],
        hardStops: [
          "failed gate",
          "missing context",
          "failed verification",
          "failed review",
          "failed reconcile"
        ],
        nextRecommendedCommand: "visp-kit next"
      },
      {
        target: input.target,
        name: "visp-task",
        purpose: "Implement the next/current Visp task only.",
        entrypointFile: entrypointForTarget(input.target, "task"),
        requiredVispCommands: [
          "visp-kit status",
          "visp-kit gate next",
          "visp-kit gate implement --task <task-id>"
        ],
        hardStops: ["failed gate", "missing context", "unclear task"],
        nextRecommendedCommand: "visp-kit verify --task <task-id>"
      },
      {
        target: input.target,
        name: "visp-fix",
        purpose: "Repair verification, review, or reconciliation failures.",
        entrypointFile: entrypointForTarget(input.target, "fix"),
        requiredVispCommands: [
          "visp-kit status",
          "visp-kit verify --task <task-id>",
          "visp-kit review --task <task-id>",
          "visp-kit reconcile --task <task-id> --update-traceability"
        ],
        hardStops: ["unrelated scope", "unapproved dependency", "forbidden file"],
        nextRecommendedCommand: "visp-kit next"
      },
      {
        target: input.target,
        name: "visp-review",
        purpose: "Run a review-only pass.",
        entrypointFile: entrypointForTarget(input.target, "review"),
        requiredVispCommands: [
          "visp-kit status",
          "visp-kit gate review --task <task-id>",
          "visp-kit review --task <task-id>"
        ],
        hardStops: ["failed review gate", "missing verification in strict mode"],
        nextRecommendedCommand: "visp-kit reconcile --task <task-id> --update-traceability"
      },
      {
        target: input.target,
        name: "visp-pr",
        purpose: "Prepare a PR summary from Visp evidence.",
        entrypointFile: entrypointForTarget(input.target, "pr"),
        requiredVispCommands: ["visp-kit status", "visp-kit gate pr", "visp-kit pr"],
        hardStops: ["failed PR gate", "missing reconcile", "missing traceability update"],
        nextRecommendedCommand: "visp-kit pr"
      }
    ]
  };
}

export function buildWorkflowMapForTargets(targets: readonly AgentTargetName[]): AgentWorkflowMap {
  return {
    workflows: targets.flatMap((target) => buildWorkflowMap({ target }).workflows)
  };
}
