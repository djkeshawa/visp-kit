import { agentTargetNameSchema, type AgentTargetName } from "../artifacts/schemas/agent.schema.js";

export type AgentTarget = {
  readonly name: AgentTargetName;
  readonly description: string;
};

export const supportedAgentTargets: readonly AgentTarget[] = [
  {
    name: "codex",
    description: "Generate AGENTS.md and Codex skills."
  },
  {
    name: "generic",
    description: "Generate AGENTS.md and generic prompt files."
  },
  {
    name: "claude",
    description: "Generate Claude command/skill guidance."
  },
  {
    name: "copilot",
    description: "Generate GitHub Copilot repository instructions."
  },
  {
    name: "cursor",
    description: "Generate Cursor rules under .cursor/rules/."
  },
  {
    name: "gemini",
    description: "Generate GEMINI.md and Gemini CLI custom commands."
  },
  {
    name: "opencode",
    description: "Generate AGENTS.md and portable prompt files for OpenCode."
  }
];

export function parseAgentTarget(value: string): AgentTargetName | undefined {
  const parsed = agentTargetNameSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
