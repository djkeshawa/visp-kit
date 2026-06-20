import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CommanderError } from "commander";
import { describe, expect, it } from "vitest";

import {
  contextPackArtifactPath,
  projectConfigArtifactPath,
  projectProfileArtifactPath,
  projectStatusArtifactPath,
  taskGraphArtifactPath
} from "../../../src/artifacts/artifact-paths.js";
import { createCli } from "../../../src/cli/main.js";
import { runIntegrationContractWorkflow } from "../../../src/workflows/integration.workflow.js";
import {
  timestamp,
  validContextPack,
  validProjectConfig,
  validProjectProfile,
  validTaskGraph
} from "../artifacts/fixtures.js";

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createKitProject(): Promise<string> {
  const targetPath = await mkdtemp(join(tmpdir(), "visp-contract-"));
  const featureKey = "001-note-pinning";
  await writeJson(projectConfigArtifactPath(targetPath), validProjectConfig);
  await writeJson(projectProfileArtifactPath(targetPath), {
    ...validProjectProfile,
    rootPath: targetPath
  });
  await writeJson(projectStatusArtifactPath(targetPath), {
    initialized: true,
    activeFeatureId: "001",
    activeFeatureSlug: "note-pinning",
    activeFeaturePath: `.visp/features/${featureKey}`,
    activeTaskId: "T001",
    currentState: "context_ready",
    lastCommand: "context",
    createdAt: timestamp,
    updatedAt: timestamp
  });
  await writeJson(taskGraphArtifactPath(targetPath, featureKey), validTaskGraph);
  await writeJson(contextPackArtifactPath(targetPath, featureKey, "T001"), validContextPack);
  return targetPath;
}

describe("integration contract workflow", () => {
  it("returns a read-only contract for an uninitialized project", async () => {
    const targetPath = await mkdtemp(join(tmpdir(), "visp-contract-empty-"));

    const result = await runIntegrationContractWorkflow({ targetPath });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.initialized).toBe(false);
      expect(result.value.contractVersion).toBe("1.1");
      expect(result.value.commands.gateImplement).toEqual([
        "gate",
        "implement",
        "--task",
        "<task-id>",
        "--json"
      ]);
      expect(result.value.commands.hooksGit).toEqual(["hooks", "git", "--json"]);
      expect(result.value.capabilities).toMatchObject({
        deterministic: { noLlmCalls: true, localArtifacts: true, jsonOutput: true },
        governance: {
          policyAsCode: true,
          failClosedGates: true,
          sourceEditsRequireImplementGate: true,
          contextPackRequiredForImplementation: true
        },
        contextGrounding: {
          phaseLevelArtifacts: true,
          taskScopedContextPacks: true,
          currentTaskPrompt: true
        },
        evidence: {
          verification: true,
          review: true,
          reconciliation: true,
          traceability: true
        },
        enforcementSurfaces: {
          claudePreToolUseHook: true,
          gitPreCommitHook: true,
          ciPolicyGate: true
        }
      });
      expect(result.value.workflow.strictSequence).toEqual([
        "status",
        "policyValidate",
        "gateNext",
        "context",
        "gateImplement",
        "verify",
        "review",
        "reconcile"
      ]);
      expect(result.value.workflow.failClosedOn).toContain("gateImplement");
      expect(result.value.workflow.humanOverride).toMatchObject({
        requiresReason: true,
        artifact: ".visp/overrides.json"
      });
      expect(result.value.artifacts.contextPack).toBe(
        ".visp/features/<feature>/context/<task-id>.context.json"
      );
    }
  });

  it("includes active feature, task, and artifact paths for initialized Kit projects", async () => {
    const targetPath = await createKitProject();

    const result = await runIntegrationContractWorkflow({ targetPath });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.initialized).toBe(true);
      expect(result.value.kit.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(result.value.activeFeature?.key).toBe("001-note-pinning");
      expect(result.value.activeTask?.id).toBe("T001");
      expect(result.value.artifacts.taskGraph).toBe(".visp/features/001-note-pinning/task-graph.json");
      expect(result.value.artifacts.contextPack).toBe(
        ".visp/features/001-note-pinning/context/T001.context.json"
      );
    }
  });

  it("prints contract JSON through the CLI", async () => {
    const targetPath = await createKitProject();
    const output: string[] = [];
    const program = createCli({
      writeOut: (value) => output.push(value),
      writeErr: (value) => output.push(value)
    });
    program.exitOverride();

    try {
      await program.parseAsync(["node", "visp", "integration", "contract", targetPath, "--json"]);
    } catch (error) {
      if (!(error instanceof CommanderError)) {
        throw error;
      }
    }

    const parsed = JSON.parse(output.join("")) as {
      success: boolean;
      contractVersion: string;
      capabilities: { governance: { failClosedGates: boolean } };
    };
    expect(parsed.success).toBe(true);
    expect(parsed.contractVersion).toBe("1.1");
    expect(parsed.capabilities.governance.failClosedGates).toBe(true);
  });

  it("prints the package version through --version from package.json", async () => {
    const pkg = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
      version: string;
    };
    const output: string[] = [];
    const program = createCli();

    program.configureOutput({
      writeOut: (value) => output.push(value),
      writeErr: (value) => output.push(value)
    });
    program.exitOverride();

    try {
      program.parse(["node", "visp", "--version"]);
    } catch (error) {
      if (!(error instanceof CommanderError) || error.code !== "commander.version") {
        throw error;
      }
    }

    expect(output.join("").trim()).toBe(pkg.version);
  });
});
