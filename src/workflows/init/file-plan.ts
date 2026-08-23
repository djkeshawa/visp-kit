import path from "node:path";

import {
  featuresArtifactDir,
  memoryArtifactDir,
  presetsArtifactDir,
  policyArtifactPath,
  projectConfigArtifactPath,
  projectProfileArtifactPath,
  projectStatusArtifactPath,
  runsArtifactDir,
  workflowManifestArtifactPath
} from "../../artifacts/artifact-paths.js";
import {
  type AgentMode,
  type BudgetMode,
  type Preset
} from "../../artifacts/schemas/common.schema.js";
import {
  agentCapabilitiesSchema,
  agentWorkflowMapSchema,
  installedAgentTargetsSchema,
  type AgentTargetName,
  type InstalledAgentTargets
} from "../../artifacts/schemas/agent.schema.js";
import {
  projectConfigSchema,
  projectProfileSchema,
  projectStatusSchema
} from "../../artifacts/schemas/project.schema.js";
import {
  policyArtifactSchema,
  type StrictnessMode
} from "../../artifacts/schemas/policy.schema.js";
import { type VispError } from "../../core/errors.js";
import { pathExists } from "../../core/file-system.js";
import { ok, type Result } from "../../core/result.js";
import { createDefaultPolicy } from "../../policy/policy-defaults.js";
import {
  agentCapabilitiesPath,
  agentGuidePath,
  agentsMarkdownPath,
  agentsVispMarkdownPath,
  installedTargetsPath,
  workflowMapPath
} from "../../agent/agent-paths.js";
import { buildWorkflowMapForTargets, renderAgentGuide } from "../../agent/agent-renderer.js";
import { buildAgentCapabilities } from "../../agent/agent-capabilities.js";
import { memoryToolingDetected } from "../../agent/memory-detection.js";
import { targetFiles } from "../../agent/targets/target-files.js";
import { workflowManifestSchema } from "../../artifacts/schemas/workflow.schema.js";
import { defaultWorkflowManifest } from "../../workflow-manifest/default-workflow.js";
import {
  createDefaultProjectConfig,
  createDefaultProjectProfile,
  createDefaultProjectStatus
} from "./default-artifacts.js";
import {
  compactConstitutionMarkdown,
  constitutionMarkdown,
  placeholderMemoryMarkdown,
  placeholderReportMarkdown
} from "./default-constitution.js";
import { type InitFileAction } from "./init-summary.js";
import { artifactFile, textFile, type PlannedFile } from "./planned-file.js";

export type InitFilePlanInput = {
  readonly targetPath: string;
  readonly agent: AgentMode;
  readonly preset: Preset;
  readonly budget: BudgetMode;
  readonly strictness: StrictnessMode;
  readonly force: boolean;
  /** Only the wording of the plan's warnings depends on this; the plan itself is the same. */
  readonly dryRun: boolean;
  readonly now: string;
};

export type InitFilePlan = {
  readonly directories: readonly string[];
  readonly files: readonly PlannedFile[];
  readonly actions: readonly InitFileAction[];
  readonly warnings: readonly string[];
};

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function cachePlaceholder(kind: string): unknown {
  return { kind, populatedBy: "visp-kit scan", items: [] };
}

function baseDirectories(targetPath: string): readonly string[] {
  return [
    targetPath,
    path.join(targetPath, ".visp"),
    memoryArtifactDir(targetPath),
    path.join(targetPath, ".visp", "cache"),
    path.join(targetPath, ".visp", "agent"),
    featuresArtifactDir(targetPath),
    path.join(targetPath, ".visp", "prompts"),
    path.join(targetPath, ".visp", "reports"),
    runsArtifactDir(targetPath),
    presetsArtifactDir(targetPath)
  ];
}

function baseFiles(input: InitFilePlanInput): readonly PlannedFile[] {
  const artifactInput = {
    targetPath: input.targetPath,
    agent: input.agent,
    preset: input.preset,
    budget: input.budget,
    now: input.now
  };
  const cacheDir = path.join(input.targetPath, ".visp", "cache");
  const memoryDir = memoryArtifactDir(input.targetPath);
  const reportsDir = path.join(input.targetPath, ".visp", "reports");

  return [
    artifactFile(
      input.targetPath,
      projectProfileArtifactPath(input.targetPath),
      "project profile",
      projectProfileSchema,
      createDefaultProjectProfile(artifactInput)
    ),
    artifactFile(
      input.targetPath,
      projectConfigArtifactPath(input.targetPath),
      "project config",
      projectConfigSchema,
      createDefaultProjectConfig(artifactInput)
    ),
    artifactFile(
      input.targetPath,
      projectStatusArtifactPath(input.targetPath),
      "project status",
      projectStatusSchema,
      createDefaultProjectStatus(artifactInput)
    ),
    artifactFile(
      input.targetPath,
      policyArtifactPath(input.targetPath),
      "policy",
      policyArtifactSchema,
      createDefaultPolicy({
        strictnessMode: input.strictness,
        now: input.now
      })
    ),
    artifactFile(
      input.targetPath,
      workflowManifestArtifactPath(input.targetPath),
      "workflow manifest",
      workflowManifestSchema,
      defaultWorkflowManifest(input.now)
    ),
    textFile(
      input.targetPath,
      path.join(memoryDir, "constitution.md"),
      constitutionMarkdown(input.preset, input.budget)
    ),
    textFile(
      input.targetPath,
      path.join(memoryDir, "constitution.compact.md"),
      compactConstitutionMarkdown()
    ),
    textFile(
      input.targetPath,
      path.join(memoryDir, "project-summary.md"),
      placeholderMemoryMarkdown("Project Summary")
    ),
    textFile(
      input.targetPath,
      path.join(memoryDir, "patterns.md"),
      placeholderMemoryMarkdown("Project Patterns")
    ),
    textFile(
      input.targetPath,
      path.join(cacheDir, "file-index.json"),
      jsonText(cachePlaceholder("file-index"))
    ),
    textFile(
      input.targetPath,
      path.join(cacheDir, "module-map.json"),
      jsonText(cachePlaceholder("module-map"))
    ),
    textFile(
      input.targetPath,
      path.join(cacheDir, "test-map.json"),
      jsonText(cachePlaceholder("test-map"))
    ),
    textFile(
      input.targetPath,
      path.join(cacheDir, "dependency-map.json"),
      jsonText(cachePlaceholder("dependency-map"))
    ),
    textFile(
      input.targetPath,
      path.join(cacheDir, "file-summaries.json"),
      jsonText(cachePlaceholder("file-summaries"))
    ),
    textFile(
      input.targetPath,
      path.join(cacheDir, "scan-meta.json"),
      jsonText({ status: "pending", populatedBy: "visp-kit scan", updatedAt: null })
    ),
    textFile(
      input.targetPath,
      path.join(reportsDir, "budget-report.md"),
      placeholderReportMarkdown("Budget Report")
    ),
    textFile(
      input.targetPath,
      path.join(reportsDir, "scan-report.md"),
      placeholderReportMarkdown("Scan Report")
    ),
    textFile(
      input.targetPath,
      path.join(reportsDir, "doctor-report.md"),
      placeholderReportMarkdown("Doctor Report")
    )
  ];
}

/**
 * What init says about the `AGENTS.visp.md` it writes beside a project's own
 * `AGENTS.md`.
 *
 * Four claims, because two conditions decide whether a write happens and only
 * one of them is the run mode. A dry run writes nothing; a second real run
 * writes nothing either, because the fallback file is already there and this
 * branch never carries `--force`. Reporting a creation in that second case put
 * "Created AGENTS.visp.md" on the same screen as "Created: 0 files", and left
 * the reader believing a file had been refreshed to the options they just
 * passed when it still held the ones from the first run.
 */
function fallbackAgentsNote(input: { readonly dryRun: boolean; readonly writes: boolean }): string {
  if (!input.writes) {
    return input.dryRun
      ? "AGENTS.md already exists. Would leave the existing AGENTS.visp.md unchanged, so it may not reflect this run's options."
      : "AGENTS.md already exists. Left the existing AGENTS.visp.md unchanged, so it may not reflect this run's options.";
  }

  return input.dryRun
    ? "AGENTS.md already exists. Would write AGENTS.visp.md for manual merge or reference."
    : "AGENTS.md already exists. Created AGENTS.visp.md for manual merge or reference.";
}

async function agentPlan(input: InitFilePlanInput): Promise<Result<InitFilePlan, VispError>> {
  const target = agentTargetFromMode(input.agent);

  if (target === undefined) {
    return ok({ directories: [], files: [], actions: [], warnings: [] });
  }

  const actions: InitFileAction[] = [];
  const warnings: string[] = [];
  const agentsExists = await pathExists(agentsMarkdownPath(input.targetPath));

  if (!agentsExists.ok) {
    return agentsExists;
  }

  if (agentsExists.value && !input.force) {
    const fallbackExists = await pathExists(agentsVispMarkdownPath(input.targetPath));

    if (!fallbackExists.ok) {
      return fallbackExists;
    }

    actions.push({ path: "AGENTS.md", action: "skipped" });
    warnings.push(fallbackAgentsNote({ dryRun: input.dryRun, writes: !fallbackExists.value }));
  }

  const useFallbackAgentsFile = agentsExists.value && !input.force;
  const files = targetFiles({
    target,
    targetPath: input.targetPath,
    strictness: input.strictness,
    useFallbackAgentsFile,
    memoryDetected: await memoryToolingDetected(input.targetPath)
  });
  const targetFilePaths = files.map((file) =>
    path.relative(input.targetPath, file.path).split(path.sep).join("/")
  );
  const installedTargets: InstalledAgentTargets = {
    installedTargets: [
      {
        target,
        strictnessMode: input.strictness,
        installedAt: input.now,
        refreshedAt: input.now,
        files: targetFilePaths,
        version: "1.0",
        warnings
      }
    ]
  };

  return ok({
    directories: target === "codex" ? [path.join(input.targetPath, ".agents", "skills")] : [],
    files: [
      ...files.map((file) => textFile(input.targetPath, file.path, file.contents)),
      artifactFile(
        input.targetPath,
        installedTargetsPath(input.targetPath),
        "installed agent targets",
        installedAgentTargetsSchema,
        installedTargets
      ),
      textFile(
        input.targetPath,
        agentGuidePath(input.targetPath),
        renderAgentGuide({
          target,
          strictness: input.strictness
        })
      ),
      artifactFile(
        input.targetPath,
        workflowMapPath(input.targetPath),
        "agent workflow map",
        agentWorkflowMapSchema,
        buildWorkflowMapForTargets([target])
      ),
      artifactFile(
        input.targetPath,
        agentCapabilitiesPath(input.targetPath),
        "agent capabilities",
        agentCapabilitiesSchema,
        buildAgentCapabilities({
          metadata: installedTargets,
          generatedAt: input.now
        })
      )
    ],
    actions,
    warnings
  });
}

function agentTargetFromMode(agent: AgentMode): AgentTargetName | undefined {
  if (agent === "codex") return "codex";
  if (agent === "generic") return "generic";
  return undefined;
}

export async function buildInitFilePlan(
  input: InitFilePlanInput
): Promise<Result<InitFilePlan, VispError>> {
  const agent = await agentPlan(input);

  if (!agent.ok) {
    return agent;
  }

  return ok({
    directories: [...baseDirectories(input.targetPath), ...agent.value.directories],
    files: [...baseFiles(input), ...agent.value.files],
    actions: agent.value.actions,
    warnings: agent.value.warnings
  });
}
