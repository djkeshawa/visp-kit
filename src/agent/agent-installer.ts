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
  type PolicyArtifact,
  type StrictnessMode
} from "../artifacts/schemas/policy.schema.js";
import { VispError } from "../core/errors.js";
import { pathExists, readJsonFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { policyRulesForStrictness } from "../policy/policy-defaults.js";
import { ensureVispProject, loadEffectivePolicy } from "../policy/policy-loader.js";
import { policyArtifactPath } from "../artifacts/artifact-paths.js";
import {
  agentGuidePath,
  agentsMarkdownPath,
  agentsVispMarkdownPath,
  geminiMarkdownPath,
  installedTargetsPath,
  workflowMapPath
} from "./agent-paths.js";
import { buildWorkflowMapForTargets, renderAgentGuide } from "./agent-renderer.js";
import { agentCapabilitiesPlannedFile } from "./agent-capabilities.js";
import {
  generatedContentHash,
  plannedFileContents,
  wroteFile,
  writeAgentPlannedFile,
  type AgentFileAction,
  type AgentPlannedFile
} from "./agent-file-plan.js";
import { codexTargetFiles } from "./targets/codex.js";
import { genericTargetFiles } from "./targets/generic.js";
import { claudeTargetFiles } from "./targets/claude.js";
import { copilotTargetFiles } from "./targets/copilot.js";
import { cursorTargetFiles } from "./targets/cursor.js";
import { geminiTargetFiles } from "./targets/gemini.js";
import { opencodeTargetFiles } from "./targets/opencode.js";
import { targetPathFrom } from "../core/paths.js";

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
  readonly policy: PolicyArtifact;
  readonly policyExists: boolean;
  readonly strictness: StrictnessMode;
  readonly now: string;
  readonly dryRun: boolean;
}): Promise<Result<boolean, VispError>> {
  const policyPath = policyArtifactPath(input.targetPath);
  const policy: PolicyArtifact = {
    ...input.policy,
    strictnessMode: input.strictness,
    rules: policyRulesForStrictness(input.strictness),
    updatedAt: input.now
  };

  if (!input.dryRun) {
    const write = await writeArtifact(policyPath, policyArtifactSchema, policy, {
      artifactName: "policy"
    });

    if (!write.ok) return write;
  }

  return ok(!input.policyExists);
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

function bucketActions(
  actions: readonly { readonly path: string; readonly action: AgentFileAction }[]
): {
  readonly createdFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly overwrittenFiles: readonly string[];
  readonly updatedFiles: readonly string[];
} {
  return {
    createdFiles: actions.filter((item) => item.action === "created").map((item) => item.path),
    skippedFiles: actions.filter((item) => item.action === "skipped").map((item) => item.path),
    overwrittenFiles: actions
      .filter((item) => item.action === "overwritten")
      .map((item) => item.path),
    updatedFiles: actions.filter((item) => item.action === "updated").map((item) => item.path)
  };
}

/**
 * What `agent install` says about the `AGENTS.visp.md` it plans beside a
 * project's own `AGENTS.md`.
 *
 * Four claims, because two conditions decide whether a write happens and only
 * one of them is the run mode. A dry run writes nothing; a second real run
 * usually writes nothing either, because the fallback file is already there and
 * this branch never carries `--force`. The sentence used to be pushed the
 * moment control reached the branch, in the past tense, with nothing checking
 * the write — so the command claimed a file had been refreshed to options it
 * never saw. `init` keys its copy of this note on the same question.
 */
function fallbackAgentsNote(input: { readonly dryRun: boolean; readonly wrote: boolean }): string {
  if (!input.wrote) {
    return input.dryRun
      ? "AGENTS.md already exists. Would leave the existing AGENTS.visp.md unchanged, so it may not reflect this run's options."
      : "AGENTS.md already exists. Left the existing AGENTS.visp.md unchanged, so it may not reflect this run's options.";
  }

  return input.dryRun
    ? "AGENTS.md already exists. Would write AGENTS.visp.md for manual merge or reference."
    : "AGENTS.md already exists. Wrote AGENTS.visp.md for manual merge or reference.";
}

async function targetFiles(input: {
  readonly targetPath: string;
  readonly target: AgentTargetName;
  readonly strictness: StrictnessMode;
  readonly force: boolean;
}): Promise<
  Result<
    {
      readonly files: readonly AgentPlannedFile[];
      /**
       * Set only when the plan diverted the guide to `AGENTS.visp.md`. The note
       * about that file is written after the write loop, from the action this
       * path actually got.
       */
      readonly fallbackAgentsPath?: string;
    },
    VispError
  >
> {
  const shouldPlanAgentsFile =
    input.target === "codex" ||
    input.target === "generic" ||
    input.target === "copilot" ||
    input.target === "opencode";
  const agentsExists = shouldPlanAgentsFile
    ? await pathExists(agentsMarkdownPath(input.targetPath))
    : input.target === "gemini"
      ? await pathExists(geminiMarkdownPath(input.targetPath))
      : ok(false);

  if (!agentsExists.ok) return agentsExists;

  const useFallbackAgentsFile = shouldPlanAgentsFile && agentsExists.value && !input.force;

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

  return ok(
    useFallbackAgentsFile
      ? { files, fallbackAgentsPath: agentsVispMarkdownPath(input.targetPath) }
      : { files }
  );
}

function nextMetadata(input: {
  readonly target: AgentTargetName;
  readonly strictness: StrictnessMode;
  readonly now: string;
  readonly metadata: InstalledAgentTargets;
  readonly targetFilePaths: readonly string[];
  readonly fileHashes?: Readonly<Record<string, string>>;
  readonly warnings: readonly string[];
}): InstalledAgentTargets {
  const existing = input.metadata.installedTargets.find((target) => target.target === input.target);
  const nextTarget: InstalledAgentTarget = {
    target: input.target,
    strictnessMode: input.strictness,
    installedAt: existing?.installedAt ?? input.now,
    refreshedAt: input.now,
    files: [...input.targetFilePaths],
    ...(input.fileHashes === undefined ? {} : { fileHashes: { ...input.fileHashes } }),
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
  readonly fileHashes?: Readonly<Record<string, string>>;
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
    },
    agentCapabilitiesPlannedFile({
      targetPath: input.targetPath,
      metadata,
      generatedAt: input.now,
      strictness: input.strictness
    })
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
        `${initialized.error.message} Recommended: visp-kit init --strictness strict.`
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
      policy: policy.value.policy,
      policyExists: policy.value.exists,
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

  const metadata = await readInstalledTargets(targetPath);

  if (!metadata.ok) return metadata;

  const existingTarget = metadata.value.installedTargets.find(
    (installed) => installed.target === options.target
  );
  const nextFileHashes: Record<string, string> = {};
  let fallbackAgentsAction: AgentFileAction | undefined;
  for (const file of plan.value.files) {
    const relPath = relativePath(targetPath, file.path);
    const write = await writeAgentPlannedFile(targetPath, file, {
      force,
      dryRun,
      // D-118 decision 4: bytes still matching what we last generated mean
      // the user never touched the file, so a changed template regenerates
      // silently. Anything else divergent is refused as `stale`.
      recordedHash: existingTarget?.fileHashes?.[relPath]
    });

    if (!write.ok) return write;
    actions.push(write.value);
    if (file.path === plan.value.fallbackAgentsPath) fallbackAgentsAction = write.value.action;
    const planned = plannedFileContents(file);
    if (planned !== undefined) {
      if (write.value.action === "stale") {
        // Keep the previous record: the disk bytes are the user's, and a
        // later run must still be able to recognize an untouched revert.
        const previous = existingTarget?.fileHashes?.[relPath];
        if (previous !== undefined) nextFileHashes[relPath] = previous;
      } else {
        nextFileHashes[relPath] = generatedContentHash(planned);
      }
    }
  }

  if (plan.value.fallbackAgentsPath !== undefined) {
    warnings.push(
      fallbackAgentsNote({
        dryRun,
        wrote: fallbackAgentsAction !== undefined && wroteFile(fallbackAgentsAction)
      })
    );
  }

  const metadataPlan = metadataFiles({
    targetPath,
    target: options.target,
    strictness,
    now,
    metadata: metadata.value,
    targetFilePaths: plan.value.files.map((file) => relativePath(targetPath, file.path)),
    fileHashes: nextFileHashes,
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
