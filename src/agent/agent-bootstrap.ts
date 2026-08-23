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
  installedTargetsPath,
  sharedGuidanceFile,
  workflowMapPath
} from "./agent-paths.js";
import {
  fallbackAgentsNote,
  runAgentInstall,
  type AgentInstallSummary
} from "./agent-installer.js";
import { memoryStoreDetected } from "./memory-detection.js";
import { targetFiles } from "./targets/target-files.js";
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
  // The same question `agent install` asks, from the same helper, so a dry run
  // cannot promise a divert the real run will not perform.
  const guidance = sharedGuidanceFile(input.target, input.targetPath);
  const guidanceExists =
    guidance === undefined ? ok(false) : await pathExists(guidance.primaryPath);

  if (!guidanceExists.ok) return guidanceExists;

  const useFallbackAgentsFile = guidanceExists.value && !input.force;
  // No `.visp/` does not mean no fallback file: a leftover `AGENTS.visp.md` or
  // `GEMINI.visp.md` survives a deleted `.visp/`, and the real run refuses a
  // divergent existing file as stale. The dry run asks the disk the same
  // question rather than promising a write.
  const fallbackExists =
    useFallbackAgentsFile && guidance !== undefined
      ? await pathExists(guidance.fallbackPath)
      : ok(false);

  if (!fallbackExists.ok) return fallbackExists;
  const memoryDetected = await memoryStoreDetected(input.targetPath);

  if (!memoryDetected.ok) return memoryDetected;

  const targetFilePlan = targetFiles({
    target: input.target,
    targetPath: input.targetPath,
    strictness: input.strictness,
    useFallbackAgentsFile,
    memoryDetected: memoryDetected.value
  });
  const createdFiles = [
    ...targetFilePlan.map((file) => relativePath(input.targetPath, file.path)),
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
    warnings:
      useFallbackAgentsFile && guidance !== undefined
        ? [
            fallbackAgentsNote({
              dryRun: true,
              wrote: !fallbackExists.value,
              primaryName: guidance.primaryName,
              fallbackName: guidance.fallbackName
            })
          ]
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
