import { type AgentTargetName } from "../artifacts/schemas/agent.schema.js";
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

export function cursorRulesDir(rootPath: string): string {
  return joinPath(rootPath, ".cursor", "rules");
}

export function cursorRulePath(rootPath: string, name: string): string {
  return joinPath(cursorRulesDir(rootPath), `${name}.mdc`);
}

export function geminiMarkdownPath(rootPath: string): string {
  return joinPath(rootPath, "GEMINI.md");
}

export function geminiVispMarkdownPath(rootPath: string): string {
  return joinPath(rootPath, "GEMINI.visp.md");
}

export function geminiCommandPath(rootPath: string, name: string): string {
  return joinPath(rootPath, ".gemini", "commands", `${name}.toml`);
}

export type SharedGuidanceFile = {
  /** The file the target reads, which the project may already own. */
  readonly primaryPath: string;
  /** Where Kit's guidance goes instead, when the project owns the primary. */
  readonly fallbackPath: string;
  readonly primaryName: string;
  readonly fallbackName: string;
};

/**
 * The guidance file a target reads when that file is one the project may have
 * written for itself, plus the `*.visp.md` sibling Kit diverts to rather than
 * overwrite it.
 *
 * One answer for every target, in one place, because the question was
 * previously asked twice with two different answers. `agent install` decided
 * which targets divert from a list that omitted `gemini`, so a project's own
 * `GEMINI.md` was overwritten while `AGENTS.md` was protected — even though
 * `geminiTargetFiles` had taken the divert flag all along and `agent doctor`
 * already looked for `GEMINI.visp.md`. `agent bootstrap --dry-run` used a
 * different list that did include `gemini`, so the dry run promised a divert the
 * real run did not perform.
 *
 * `claude` and `cursor` write only into their own `.claude/` and `.cursor/`
 * directories, so they have nothing to divert.
 */
export function sharedGuidanceFile(
  target: AgentTargetName,
  rootPath: string
): SharedGuidanceFile | undefined {
  switch (target) {
    case "codex":
    case "generic":
    case "copilot":
    case "opencode":
      return {
        primaryPath: agentsMarkdownPath(rootPath),
        fallbackPath: agentsVispMarkdownPath(rootPath),
        primaryName: "AGENTS.md",
        fallbackName: "AGENTS.visp.md"
      };
    case "gemini":
      return {
        primaryPath: geminiMarkdownPath(rootPath),
        fallbackPath: geminiVispMarkdownPath(rootPath),
        primaryName: "GEMINI.md",
        fallbackName: "GEMINI.visp.md"
      };
    case "claude":
    case "cursor":
      return undefined;
  }
}

export function copilotInstructionsPath(rootPath: string): string {
  return joinPath(rootPath, ".github", "copilot-instructions.md");
}

export function copilotWorkflowInstructionPath(rootPath: string, name: string): string {
  return joinPath(rootPath, ".github", "instructions", `visp-${name}.instructions.md`);
}
