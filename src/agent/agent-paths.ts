import { joinPath, vispDir } from "../core/paths.js";

export function agentMetadataDir(rootPath: string): string {
  return joinPath(vispDir(rootPath), "agent");
}

export function installedTargetsPath(rootPath: string): string {
  return joinPath(agentMetadataDir(rootPath), "installed-targets.json");
}

export function agentGuidePath(rootPath: string): string {
  return joinPath(agentMetadataDir(rootPath), "agent-guide.md");
}

export function workflowMapPath(rootPath: string): string {
  return joinPath(agentMetadataDir(rootPath), "workflow-map.json");
}

export function agentCapabilitiesPath(rootPath: string): string {
  return joinPath(agentMetadataDir(rootPath), "capabilities.json");
}

export function agentsMarkdownPath(rootPath: string): string {
  return joinPath(rootPath, "AGENTS.md");
}

export function agentsVispMarkdownPath(rootPath: string): string {
  return joinPath(rootPath, "AGENTS.visp.md");
}

export function codexSkillPath(rootPath: string, name: string): string {
  return joinPath(rootPath, ".agents", "skills", name, "SKILL.md");
}

export function genericAgentPromptPath(rootPath: string, name: string): string {
  return joinPath(vispDir(rootPath), "prompts", `agent-${name}.prompt.md`);
}

export function vispRulesFilePath(rootPath: string): string {
  return joinPath(vispDir(rootPath), "prompts", "visp-rules.md");
}

export function vispHooksDir(rootPath: string): string {
  return joinPath(vispDir(rootPath), "hooks");
}

export function claudePreToolUseHookPath(rootPath: string): string {
  return joinPath(vispHooksDir(rootPath), "claude-pretooluse.mjs");
}

export function preCommitCheckPath(rootPath: string): string {
  return joinPath(vispHooksDir(rootPath), "visp-pre-commit.mjs");
}

export function hooksReadmePath(rootPath: string): string {
  return joinPath(vispHooksDir(rootPath), "README.md");
}

export function gitPreCommitHookPath(rootPath: string): string {
  return joinPath(rootPath, ".git", "hooks", "pre-commit");
}

export function githubEvidenceWorkflowPath(rootPath: string): string {
  return joinPath(rootPath, ".github", "workflows", "visp-evidence.yml");
}

export function claudeCommandPath(rootPath: string, name: string): string {
  return joinPath(rootPath, ".claude", "commands", `visp-${name}.md`);
}

export function copilotInstructionsPath(rootPath: string): string {
  return joinPath(rootPath, ".github", "copilot-instructions.md");
}

export function copilotWorkflowInstructionPath(rootPath: string, name: string): string {
  return joinPath(rootPath, ".github", "instructions", `visp-${name}.instructions.md`);
}
