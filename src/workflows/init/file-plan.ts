import path from "node:path";

import {
  featuresArtifactDir,
  memoryArtifactDir,
  policyArtifactPath,
  projectConfigArtifactPath,
  projectProfileArtifactPath,
  projectStatusArtifactPath
} from "../../artifacts/artifact-paths.js";
import {
  type AgentMode,
  type BudgetMode,
  type Preset
} from "../../artifacts/schemas/common.schema.js";
import {
  projectConfigSchema,
  projectProfileSchema,
  projectStatusSchema
} from "../../artifacts/schemas/project.schema.js";
import {
  policyArtifactSchema,
  type StrictnessMode
} from "../../artifacts/schemas/policy.schema.js";
import { VispError } from "../../core/errors.js";
import { pathExists } from "../../core/file-system.js";
import { ok, type Result } from "../../core/result.js";
import { createDefaultPolicy } from "../../policy/policy-defaults.js";
import {
  codexAgentsMarkdown,
  codexSkillFiles
} from "./codex-integration.js";
import {
  createDefaultProjectConfig,
  createDefaultProjectProfile,
  createDefaultProjectStatus
} from "./default-artifacts.js";
import {
  compactConstitutionMarkdown,
  constitutionMarkdown,
  genericAgentGuidanceMarkdown,
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
  return { kind, populatedBy: "visp scan", items: [] };
}

function baseDirectories(targetPath: string): readonly string[] {
  return [
    targetPath,
    path.join(targetPath, ".visp"),
    memoryArtifactDir(targetPath),
    path.join(targetPath, ".visp", "cache"),
    featuresArtifactDir(targetPath),
    path.join(targetPath, ".visp", "reports")
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
    textFile(input.targetPath, path.join(memoryDir, "constitution.md"), constitutionMarkdown(input.preset, input.budget)),
    textFile(input.targetPath, path.join(memoryDir, "constitution.compact.md"), compactConstitutionMarkdown()),
    textFile(input.targetPath, path.join(memoryDir, "project-summary.md"), placeholderMemoryMarkdown("Project Summary")),
    textFile(input.targetPath, path.join(memoryDir, "patterns.md"), placeholderMemoryMarkdown("Project Patterns")),
    textFile(input.targetPath, path.join(cacheDir, "file-index.json"), jsonText(cachePlaceholder("file-index"))),
    textFile(input.targetPath, path.join(cacheDir, "module-map.json"), jsonText(cachePlaceholder("module-map"))),
    textFile(input.targetPath, path.join(cacheDir, "test-map.json"), jsonText(cachePlaceholder("test-map"))),
    textFile(input.targetPath, path.join(cacheDir, "dependency-map.json"), jsonText(cachePlaceholder("dependency-map"))),
    textFile(input.targetPath, path.join(cacheDir, "file-summaries.json"), jsonText(cachePlaceholder("file-summaries"))),
    textFile(input.targetPath, path.join(cacheDir, "scan-meta.json"), jsonText({ status: "pending", populatedBy: "visp scan", updatedAt: null })),
    textFile(input.targetPath, path.join(reportsDir, "budget-report.md"), placeholderReportMarkdown("Budget Report")),
    textFile(input.targetPath, path.join(reportsDir, "scan-report.md"), placeholderReportMarkdown("Scan Report")),
    textFile(input.targetPath, path.join(reportsDir, "doctor-report.md"), placeholderReportMarkdown("Doctor Report"))
  ];
}

async function agentPlan(
  input: InitFilePlanInput
): Promise<Result<InitFilePlan, VispError>> {
  if (input.agent === "none") {
    return ok({ directories: [], files: [], actions: [], warnings: [] });
  }

  if (input.agent === "generic") {
    return ok({
      directories: [],
      files: [
        textFile(
          input.targetPath,
          path.join(memoryArtifactDir(input.targetPath), "agent-guidance.md"),
          genericAgentGuidanceMarkdown(input.preset, input.budget)
        )
      ],
      actions: [],
      warnings: []
    });
  }

  const actions: InitFileAction[] = [];
  const warnings: string[] = [];
  const agentsPath = path.join(input.targetPath, "AGENTS.md");
  const agentsExists = await pathExists(agentsPath);

  if (!agentsExists.ok) {
    return agentsExists;
  }

  const agentsFilePath =
    agentsExists.value && !input.force
      ? path.join(input.targetPath, "AGENTS.visp.md")
      : agentsPath;

  if (agentsExists.value && !input.force) {
    actions.push({ path: "AGENTS.md", action: "skipped" });
    warnings.push(
      "AGENTS.md already exists. Created AGENTS.visp.md for manual merge or reference."
    );
  }

  return ok({
    directories: [path.join(input.targetPath, ".agents", "skills")],
    files: [
      textFile(
        input.targetPath,
        agentsFilePath,
        codexAgentsMarkdown(input.preset, input.budget, input.strictness)
      ),
      ...codexSkillFiles(input.targetPath).map((file) =>
        textFile(input.targetPath, file.path, file.contents)
      )
    ],
    actions,
    warnings
  });
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
