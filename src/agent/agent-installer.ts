import { writeArtifact } from "../artifacts/artifact-writer.js";
import {
  agentWorkflowMapSchema,
  installedAgentTargetsSchema,
  type AgentTargetName,
  type InstalledAgentTarget,
  type InstalledAgentTargets
} from "../artifacts/schemas/agent.schema.js";
import {
  policyArtifactSchema,
  type StrictnessMode
} from "../artifacts/schemas/policy.schema.js";
import { VispError } from "../core/errors.js";
import { pathExists, readJsonFile } from "../core/file-system.js";
import { relativePath, resolvePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { createDefaultPolicy } from "../policy/policy-defaults.js";
import { ensureVispProject, loadEffectivePolicy } from "../policy/policy-loader.js";
import { policyArtifactPath } from "../artifacts/artifact-paths.js";
import {
  agentGuidePath,
  agentsMarkdownPath,
  installedTargetsPath,
  workflowMapPath
} from "./agent-paths.js";
import {
  buildWorkflowMapForTargets,
  renderAgentGuide
} from "./agent-renderer.js";
import {
  writeAgentPlannedFile,
  type AgentFileAction,
  type AgentPlannedFile
} from "./agent-file-plan.js";
import { codexTargetFiles } from "./targets/codex.js";
import { genericTargetFiles } from "./targets/generic.js";
import { claudeTargetFiles } from "./targets/claude.js";
import { copilotTargetFiles } from "./targets/copilot.js";

export type AgentInstallOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly target: AgentTargetName;
  readonly strictness?: StrictnessMode;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly now?: string;
  readonly mode?: "install" | "refresh";
};

export type AgentInstallSummary = {
  readonly success: boolean;
  readonly command: "install" | "refresh";
  readonly targetPath: string;
  readonly target: AgentTargetName;
  readonly strictnessMode: StrictnessMode;
  readonly dryRun: boolean;
  readonly createdFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly overwrittenFiles: readonly string[];
  readonly updatedFiles: readonly string[];
  readonly warnings: readonly string[];
  readonly nextInstructions: string;
};

function targetPathFrom(options: { readonly targetPath?: string; readonly cwd?: string }): string {
  return resolvePath(options.cwd ?? process.cwd(), options.targetPath ?? ".");
}

function emptyMetadata(): InstalledAgentTargets {
  return { installedTargets: [] };
}

async function readInstalledTargets(
  targetPath: string
): Promise<Result<InstalledAgentTargets, VispError>> {
  const metadataPath = installedTargetsPath(targetPath);
  const exists = await pathExists(metadataPath);

  if (!exists.ok) return exists;
  if (!exists.value) return ok(emptyMetadata());

  const raw = await readJsonFile<unknown>(metadataPath);

  if (!raw.ok) return raw;

  const parsed = installedAgentTargetsSchema.safeParse(raw.value);

  if (!parsed.success) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Invalid installed agent metadata: ${parsed.error.issues[0]?.message ?? "unknown error"}`
      )
    );
  }

  return ok(parsed.data);
}

async function writePolicyForStrictness(input: {
  readonly targetPath: string;
  readonly strictness: StrictnessMode;
  readonly now: string;
  readonly dryRun: boolean;
}): Promise<Result<boolean, VispError>> {
  const policyPath = policyArtifactPath(input.targetPath);
  const exists = await pathExists(policyPath);

  if (!exists.ok) return exists;

  const policy = createDefaultPolicy({
    strictnessMode: input.strictness,
    now: input.now
  });

  if (!input.dryRun) {
    const write = await writeArtifact(policyPath, policyArtifactSchema, policy, {
      artifactName: "policy"
    });

    if (!write.ok) return write;
  }

  return ok(!exists.value);
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
      return "Paste .visp/prompts/agent-feature.prompt.md into your AI coding tool with your feature request.";
  }
}

function bucketActions(actions: readonly { readonly path: string; readonly action: AgentFileAction }[]): {
  readonly createdFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly overwrittenFiles: readonly string[];
  readonly updatedFiles: readonly string[];
} {
  return {
    createdFiles: actions.filter((item) => item.action === "created").map((item) => item.path),
    skippedFiles: actions.filter((item) => item.action === "skipped").map((item) => item.path),
    overwrittenFiles: actions.filter((item) => item.action === "overwritten").map((item) => item.path),
    updatedFiles: actions.filter((item) => item.action === "updated").map((item) => item.path)
  };
}

async function targetFiles(input: {
  readonly targetPath: string;
  readonly target: AgentTargetName;
  readonly strictness: StrictnessMode;
  readonly force: boolean;
}): Promise<Result<{ readonly files: readonly AgentPlannedFile[]; readonly warnings: readonly string[] }, VispError>> {
  const shouldPlanAgentsFile = input.target === "codex" || input.target === "generic" || input.target === "copilot";
  const agentsExists = shouldPlanAgentsFile
    ? await pathExists(agentsMarkdownPath(input.targetPath))
    : ok(false);

  if (!agentsExists.ok) return agentsExists;

  const useFallbackAgentsFile = shouldPlanAgentsFile && agentsExists.value && !input.force;
  const warnings = useFallbackAgentsFile
    ? ["AGENTS.md already exists. Wrote AGENTS.visp.md for manual merge or reference."]
    : [];

  const files = (() => {
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
    }
  })();

  return ok({ files, warnings });
}

function nextMetadata(input: {
  readonly target: AgentTargetName;
  readonly strictness: StrictnessMode;
  readonly now: string;
  readonly metadata: InstalledAgentTargets;
  readonly targetFilePaths: readonly string[];
  readonly warnings: readonly string[];
}): InstalledAgentTargets {
  const existing = input.metadata.installedTargets.find(
    (target) => target.target === input.target
  );
  const nextTarget: InstalledAgentTarget = {
    target: input.target,
    strictnessMode: input.strictness,
    installedAt: existing?.installedAt ?? input.now,
    refreshedAt: input.now,
    files: [...input.targetFilePaths],
    version: "1.0",
    warnings: [...input.warnings]
  };

  return {
    installedTargets: [
      ...input.metadata.installedTargets.filter((target) => target.target !== input.target),
      nextTarget
    ].sort((left, right) => left.target.localeCompare(right.target))
  };
}

function metadataFiles(input: {
  readonly targetPath: string;
  readonly target: AgentTargetName;
  readonly strictness: StrictnessMode;
  readonly now: string;
  readonly metadata: InstalledAgentTargets;
  readonly targetFilePaths: readonly string[];
  readonly warnings: readonly string[];
}): readonly AgentPlannedFile[] {
  const metadata = nextMetadata(input);

  return [
    {
      kind: "artifact",
      path: installedTargetsPath(input.targetPath),
      artifactName: "installed agent targets",
      schema: installedAgentTargetsSchema,
      value: metadata
    },
    {
      kind: "text",
      path: agentGuidePath(input.targetPath),
      contents: renderAgentGuide({
        target: input.target,
        strictness: input.strictness
      })
    },
    {
      kind: "artifact",
      path: workflowMapPath(input.targetPath),
      artifactName: "agent workflow map",
      schema: agentWorkflowMapSchema,
      value: buildWorkflowMapForTargets(metadata.installedTargets.map((target) => target.target))
    }
  ];
}

export async function runAgentInstall(
  options: AgentInstallOptions
): Promise<Result<AgentInstallSummary, VispError>> {
  const targetPath = targetPathFrom(options);
  const now = options.now ?? new Date().toISOString();
  const force = options.force ?? false;
  const dryRun = options.dryRun ?? false;
  const initialized = await ensureVispProject(targetPath);

  if (!initialized.ok) {
    return err(
      new VispError(
        initialized.error.code,
        `${initialized.error.message} Recommended: visp init --strictness strict.`
      )
    );
  }

  const policy = await loadEffectivePolicy({ targetPath, now });

  if (!policy.ok) return policy;

  const warnings = [...policy.value.warnings];
  const strictness = options.strictness ?? policy.value.policy.strictnessMode;
  const actions: { path: string; action: AgentFileAction }[] = [];

  if (options.strictness !== undefined) {
    const policyWrite = await writePolicyForStrictness({
      targetPath,
      strictness,
      now,
      dryRun
    });

    if (!policyWrite.ok) return policyWrite;

    actions.push({
      path: relativePath(targetPath, policyArtifactPath(targetPath)),
      action: policyWrite.value ? "created" : "updated"
    });
  }

  const plan = await targetFiles({
    targetPath,
    target: options.target,
    strictness,
    force
  });

  if (!plan.ok) return plan;

  warnings.push(...plan.value.warnings);

  const metadata = await readInstalledTargets(targetPath);

  if (!metadata.ok) return metadata;

  for (const file of plan.value.files) {
    const write = await writeAgentPlannedFile(targetPath, file, {
      force,
      dryRun
    });

    if (!write.ok) return write;
    actions.push(write.value);
  }

  const metadataPlan = metadataFiles({
    targetPath,
    target: options.target,
    strictness,
    now,
    metadata: metadata.value,
    targetFilePaths: plan.value.files.map((file) => relativePath(targetPath, file.path)),
    warnings
  });

  for (const file of metadataPlan) {
    const write = await writeAgentPlannedFile(targetPath, file, {
      force,
      dryRun,
      alwaysUpdate: true
    });

    if (!write.ok) return write;
    actions.push(write.value);
  }

  const buckets = bucketActions(actions);

  return ok({
    success: true,
    command: options.mode ?? "install",
    targetPath,
    target: options.target,
    strictnessMode: strictness,
    dryRun,
    ...buckets,
    warnings,
    nextInstructions: nextInstructions(options.target)
  });
}
