import { type AgentTargetName } from "../artifacts/schemas/agent.schema.js";
import { type BudgetMode, type Preset } from "../artifacts/schemas/common.schema.js";
import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { type VispError } from "../core/errors.js";
import { pathExists } from "../core/file-system.js";
import { relativePath, vispDir } from "../core/paths.js";
import { ok, type Result } from "../core/result.js";
import { runInitWorkflow } from "../workflows/init.workflow.js";
import { type InitSummary } from "../workflows/init/init-summary.js";
import {
  agentGuidePath,
  agentsMarkdownPath,
  geminiMarkdownPath,
  installedTargetsPath,
  workflowMapPath
} from "./agent-paths.js";
import { runAgentInstall, type AgentInstallSummary } from "./agent-installer.js";
import { claudeTargetFiles } from "./targets/claude.js";
import { codexTargetFiles } from "./targets/codex.js";
import { copilotTargetFiles } from "./targets/copilot.js";
import { cursorTargetFiles } from "./targets/cursor.js";
import { geminiTargetFiles } from "./targets/gemini.js";
import { genericTargetFiles } from "./targets/generic.js";
import { opencodeTargetFiles } from "./targets/opencode.js";
import { targetPathFrom } from "../core/paths.js";

export type AgentBootstrapOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly target: AgentTargetName;
  readonly preset?: Preset;
  readonly budget?: BudgetMode;
  readonly strictness?: StrictnessMode;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly now?: string;
};

export type AgentBootstrapSummary = {
  readonly success: boolean;
  readonly targetPath: string;
  readonly target: AgentTargetName;
  readonly strictnessMode: StrictnessMode;
  readonly initialized: boolean;
  readonly dryRun: boolean;
  readonly init?: InitSummary;
  readonly install: AgentInstallSummary;
  readonly warnings: readonly string[];
  readonly nextCommand: string;
  readonly nextInstructions: string;
};

async function dryRunInstallSummary(input: {
  readonly targetPath: string;
  readonly target: AgentTargetName;
  readonly strictness: StrictnessMode;
  readonly force: boolean;
}): Promise<Result<AgentInstallSummary, VispError>> {
  const agentsExists = ["codex", "generic", "copilot", "opencode"].includes(input.target)
    ? await pathExists(agentsMarkdownPath(input.targetPath))
    : input.target === "gemini"
      ? await pathExists(geminiMarkdownPath(input.targetPath))
      : ok(false);

  if (!agentsExists.ok) return agentsExists;

  const useFallbackAgentsFile = agentsExists.value && !input.force;
  const targetFiles = (() => {
    switch (input.target) {
      case "codex":
        return codexTargetFiles({
          targetPath: input.targetPath,
          strictness: input.strictness,
          useFallbackAgentsFile
        });
      case "generic":
        return genericTargetFiles({
          targetPath: input.targetPath,
          strictness: input.strictness,
          useFallbackAgentsFile
        });
      case "claude":
        return claudeTargetFiles({
          targetPath: input.targetPath,
          strictness: input.strictness
        });
      case "copilot":
        return copilotTargetFiles({
          targetPath: input.targetPath,
          strictness: input.strictness,
          useFallbackAgentsFile
        });
      case "opencode":
        return opencodeTargetFiles({
          targetPath: input.targetPath,
          strictness: input.strictness,
          useFallbackAgentsFile
        });
      case "cursor":
        return cursorTargetFiles({ targetPath: input.targetPath, strictness: input.strictness });
      case "gemini":
        return geminiTargetFiles({
          targetPath: input.targetPath,
          strictness: input.strictness,
          useFallbackAgentsFile
        });
    }
  })();
  const createdFiles = [
    ...targetFiles.map((file) => relativePath(input.targetPath, file.path)),
    relativePath(input.targetPath, installedTargetsPath(input.targetPath)),
    relativePath(input.targetPath, agentGuidePath(input.targetPath)),
    relativePath(input.targetPath, workflowMapPath(input.targetPath))
  ];

  return ok({
    success: true,
    command: "install",
    targetPath: input.targetPath,
    target: input.target,
    strictnessMode: input.strictness,
    dryRun: true,
    createdFiles,
    skippedFiles: [],
    staleFiles: [],
    overwrittenFiles: [],
    updatedFiles: [],
    warnings: useFallbackAgentsFile
      ? ["AGENTS.md already exists. Would write AGENTS.visp.md for manual merge or reference."]
      : [],
    nextInstructions: nextInstructions(input.target)
  });
}

function nextInstructions(target: AgentTargetName): string {
  switch (target) {
    case "codex":
      return "Open Codex and use:\n$visp-feature\n<your feature request>";
    case "claude":
      return "Open Claude Code and use:\n/visp-feature Add note pinning";
    case "copilot":
      return "Use the repository instructions, or paste:\nUse Visp Kit workflow for this feature:\n<your feature request>\nFollow .github/instructions/visp-feature.instructions.md.";
    case "generic":
    case "opencode":
      return "Paste .visp/prompts/agent-feature.prompt.md into your AI coding tool with your feature request.";
    case "cursor":
      return "Open Cursor and mention the rule in chat:\n@visp-feature Add note pinning";
    case "gemini":
      return "Open Gemini CLI and use:\n/visp-feature Add note pinning";
  }
}

export async function runAgentBootstrap(
  options: AgentBootstrapOptions
): Promise<Result<AgentBootstrapSummary, VispError>> {
  const targetPath = targetPathFrom(options);
  const now = options.now ?? new Date().toISOString();
  const strictness = options.strictness ?? "strict";
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;
  const initialized = await pathExists(vispDir(targetPath));

  if (!initialized.ok) return initialized;

  const init = initialized.value
    ? undefined
    : await runInitWorkflow({
        targetPath,
        agent: "none",
        preset: options.preset,
        budget: options.budget ?? "lean",
        strictness,
        force,
        dryRun,
        now
      });

  if (init !== undefined && !init.ok) return init;

  const install =
    !initialized.value && dryRun
      ? await dryRunInstallSummary({
          targetPath,
          target: options.target,
          strictness,
          force
        })
      : await runAgentInstall({
          targetPath,
          target: options.target,
          strictness: initialized.value ? strictness : undefined,
          force,
          dryRun,
          now
        });

  if (!install.ok) return install;

  return ok({
    success: true,
    targetPath,
    target: options.target,
    strictnessMode: install.value.strictnessMode,
    initialized: !initialized.value,
    dryRun,
    init: init?.value,
    install: install.value,
    warnings: [...(init?.value.warnings ?? []), ...install.value.warnings],
    nextCommand: "visp-kit gate next",
    nextInstructions: install.value.nextInstructions
  });
}
