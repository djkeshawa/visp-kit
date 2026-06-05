import {
  agentCapabilitiesPath
} from "./agent-paths.js";
import {
  agentCapabilitiesSchema,
  type AgentCapabilities,
  type AgentCapability,
  type AgentTargetName,
  type InstalledAgentTargets
} from "../artifacts/schemas/agent.schema.js";
import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { type AgentPlannedFile } from "./agent-file-plan.js";

function baseLimitations(): readonly string[] {
  return [
    "Visp Kit does not call or run this AI tool automatically.",
    "Token usage must be recorded manually when the AI tool exposes it.",
    "The agent must run Visp commands inside its normal coding session."
  ];
}

function capabilityFor(input: {
  readonly target: AgentTargetName;
  readonly files: readonly string[];
}): AgentCapability {
  switch (input.target) {
    case "codex":
      return {
        target: "codex",
        supportsSkillFiles: true,
        supportsCommandFiles: false,
        supportsRepositoryInstructions: true,
        canRunShellExpected: true,
        canEditFilesExpected: true,
        tokenUsageVisibility: "manual",
        recommendedWorkflowTriggers: ["$visp-feature", "$visp-task", "$visp-fix", "$visp-review", "$visp-pr"],
        generatedFiles: [...input.files],
        limitations: [...baseLimitations()]
      };
    case "claude":
      return {
        target: "claude",
        supportsSkillFiles: false,
        supportsCommandFiles: true,
        supportsRepositoryInstructions: false,
        canRunShellExpected: true,
        canEditFilesExpected: true,
        tokenUsageVisibility: "manual",
        recommendedWorkflowTriggers: ["/visp-feature", "/visp-task", "/visp-fix", "/visp-review", "/visp-pr"],
        generatedFiles: [...input.files],
        limitations: [...baseLimitations(), "Claude command support depends on the installed Claude Code surface."]
      };
    case "copilot":
      return {
        target: "copilot",
        supportsSkillFiles: false,
        supportsCommandFiles: false,
        supportsRepositoryInstructions: true,
        canRunShellExpected: false,
        canEditFilesExpected: true,
        tokenUsageVisibility: "manual",
        recommendedWorkflowTriggers: ["Follow .github/instructions/visp-feature.instructions.md."],
        generatedFiles: [...input.files],
        limitations: [...baseLimitations(), "Copilot instruction support varies by product surface."]
      };
    case "generic":
      return {
        target: "generic",
        supportsSkillFiles: false,
        supportsCommandFiles: false,
        supportsRepositoryInstructions: true,
        canRunShellExpected: false,
        canEditFilesExpected: true,
        tokenUsageVisibility: "manual",
        recommendedWorkflowTriggers: [".visp/prompts/agent-feature.prompt.md", ".visp/prompts/agent-task.prompt.md"],
        generatedFiles: [...input.files],
        limitations: [...baseLimitations(), "Generic prompts may need to be pasted into the active AI coding tool."]
      };
  }
}

export function buildAgentCapabilities(input: {
  readonly metadata: InstalledAgentTargets;
  readonly generatedAt: string;
}): AgentCapabilities {
  return {
    generatedAt: input.generatedAt,
    capabilities: input.metadata.installedTargets.map((target) =>
      capabilityFor({
        target: target.target,
        files: target.files
      })
    )
  };
}

export function agentCapabilitiesPlannedFile(input: {
  readonly targetPath: string;
  readonly metadata: InstalledAgentTargets;
  readonly generatedAt: string;
  readonly strictness: StrictnessMode;
}): AgentPlannedFile {
  void input.strictness;

  return {
    kind: "artifact",
    path: agentCapabilitiesPath(input.targetPath),
    artifactName: "agent capabilities",
    schema: agentCapabilitiesSchema,
    value: buildAgentCapabilities({
      metadata: input.metadata,
      generatedAt: input.generatedAt
    }),
    generated: true
  };
}
