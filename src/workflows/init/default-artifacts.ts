import path from "node:path";

import {
  type AgentMode,
  type BudgetMode,
  type Preset
} from "../../artifacts/schemas/common.schema.js";
import {
  type ProjectConfig,
  type ProjectProfile,
  type ProjectStatus
} from "../../artifacts/schemas/project.schema.js";

export type DefaultArtifactInput = {
  readonly targetPath: string;
  readonly agent: AgentMode;
  readonly preset: Preset;
  readonly budget: BudgetMode;
  readonly now: string;
};

function projectName(targetPath: string): string {
  return path.basename(targetPath) || "project";
}

export function createDefaultProjectProfile(
  input: DefaultArtifactInput
): ProjectProfile {
  return {
    name: projectName(input.targetPath),
    rootPath: input.targetPath,
    packageManager: "unknown",
    languages: [],
    frameworks: [],
    testFrameworks: [],
    buildCommands: [],
    testCommands: [],
    lintCommands: [],
    typecheckCommands: [],
    sourceRoots: [],
    testRoots: [],
    ignoredPaths: ["node_modules", "dist", "build", ".git", ".visp"],
    createdAt: input.now,
    updatedAt: input.now
  };
}

export function createDefaultProjectConfig(
  input: DefaultArtifactInput
): ProjectConfig {
  return {
    schemaVersion: "1",
    projectId: projectName(input.targetPath),
    budgetMode: input.budget,
    preset: input.preset,
    agent: input.agent,
    createdAt: input.now,
    updatedAt: input.now
  };
}

export function createDefaultProjectStatus(
  input: DefaultArtifactInput
): ProjectStatus {
  return {
    initialized: true,
    activeFeatureId: null,
    currentState: "initialized",
    lastCommand: "init",
    createdAt: input.now,
    updatedAt: input.now
  };
}
