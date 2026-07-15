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
      expect(result.value.contractVersion).toBe("2.0");
      expect(result.value.commands.gateImplement).toEqual([
        "gate",
        "implement",
        "--task",
        "<task-id>",
        "--json"
      ]);
      expect(result.value.commands.context).toEqual(["context", "<task-id>", "--json"]);
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
          artifactProvenance: true,
          currentTaskPrompt: true,
          orchestratorReadContract: true
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
      expect(result.value.workflow.freshnessChecks).toEqual([
        ".visp/features/<feature>/context/<task-id>.context.json",
        "contextPack.artifactProvenance[]"
      ]);
      expect(result.value.workflow.humanOverride).toMatchObject({
        requiresReason: true,
        artifact: ".visp/overrides.json"
      });
      expect(result.value.artifacts.contextPack).toBe(
        ".visp/features/<feature>/context/<task-id>.context.json"
      );
      expect(result.value.orchestrator).toMatchObject({
        readContractVersion: "0.1",
        freshnessPolicy: {
          contextPackHashPinned: true,
          provenanceArtifactsHashPinned: true,
          staleContextBlocks: ["implementation", "checkpoint", "pr"]
        }
      });
      expect(result.value.orchestrator.requiredArtifacts).toContainEqual(
        expect.objectContaining({
          id: "context-pack",
          path: ".visp/features/<feature>/context/<task-id>.context.json",
          role: "context-pack",
          freshness: "hash-pinned"
        })
      );
      expect(result.value.orchestrator.requiredArtifacts).toContainEqual(
        expect.objectContaining({
          id: "implementation-checklist",
          path: ".visp/features/<feature>/context/<task-id>.implementation-checklist.json",
          role: "checklist",
          freshness: "gate-validated"
        })
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
      expect(result.value.artifacts.taskGraph).toBe(
        ".visp/features/001-note-pinning/task-graph.json"
      );
      expect(result.value.artifacts.contextPack).toBe(
        ".visp/features/001-note-pinning/context/T001.context.json"
      );
      expect(result.value.orchestrator.requiredArtifacts).toContainEqual(
        expect.objectContaining({
          id: "current-task-prompt",
          path: ".visp/prompts/current-task.prompt.md"
        })
      );
      expect(result.value.orchestrator.requiredArtifacts).toContainEqual(
        expect.objectContaining({
          id: "implementation-checklist",
          path: ".visp/features/001-note-pinning/context/T001.implementation-checklist.json"
        })
      );
    }
  });

  it("locks the bounded contract 2.0 command, read-role, freshness, and fail-closed surface", async () => {
    const targetPath = await mkdtemp(join(tmpdir(), "visp-contract-bounded-"));

    const result = await runIntegrationContractWorkflow({ targetPath });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.contractVersion).toBe("2.0");
      const { reconcile, ...stableCommands } = result.value.commands;
      expect(stableCommands).toEqual({
        status: ["status", "--json"],
        policyValidate: ["policy", "validate", "--json"],
        gateNext: ["gate", "next", "--json"],
        gateImplement: ["gate", "implement", "--task", "<task-id>", "--json"],
        context: ["context", "<task-id>", "--json"],
        verify: ["verify", "--task", "<task-id>", "--json"],
        review: ["review", "--task", "<task-id>", "--json"],
        budgetRecordUsage: ["budget", "--task", "<task-id>", "--record-usage", "--json"],
        done: ["done", "--task", "<task-id>", "--json"],
        hooksClaude: ["hooks", "claude", "--json"],
        hooksGit: ["hooks", "git", "--json"],
        hooksCi: ["hooks", "ci", "--json"]
      });
      expect(reconcile).toEqual(
        expect.arrayContaining(["reconcile", "--task", "<task-id>", "--json"])
      );
      expect(result.value.capabilities.governance).toEqual({
        policyAsCode: true,
        failClosedGates: true,
        overrideAuditTrail: true,
        sourceEditsRequireImplementGate: true,
        contextPackRequiredForImplementation: true
      });
      expect(result.value.workflow).toEqual({
        strictSequence: [
          "status",
          "policyValidate",
          "gateNext",
          "context",
          "gateImplement",
          "verify",
          "review",
          "reconcile"
        ],
        implementationReadSet: [
          ".visp/features/<feature>/context/<task-id>.context.json",
          ".visp/prompts/current-task.prompt.md",
          ".visp/policy.json"
        ],
        checkpointSequence: ["verify", "review", "reconcile"],
        failClosedOn: [
          "policyValidate",
          "gateNext",
          "gateImplement",
          "verify",
          "review",
          "reconcile"
        ],
        freshnessChecks: [
          ".visp/features/<feature>/context/<task-id>.context.json",
          "contextPack.artifactProvenance[]"
        ],
        humanOverride: {
          requiresReason: true,
          command: ["override", "create", "<rule-id>", "--reason", "<reason>", "--json"],
          artifact: ".visp/overrides.json"
        }
      });
      expect(result.value.orchestrator).toEqual({
        readContractVersion: "0.1",
        requiredArtifacts: [
          {
            id: "project-status",
            path: ".visp/status.json",
            role: "state",
            mimeType: "application/json",
            requiredFor: ["handoff", "gate-evaluation"],
            freshness: "read-latest"
          },
          {
            id: "project-policy",
            path: ".visp/policy.json",
            role: "policy",
            mimeType: "application/json",
            requiredFor: ["handoff", "implementation", "verification"],
            freshness: "gate-validated"
          },
          {
            id: "project-profile",
            path: ".visp/project.json",
            role: "profile",
            mimeType: "application/json",
            requiredFor: ["handoff", "implementation"],
            freshness: "read-latest"
          },
          {
            id: "task-graph",
            path: ".visp/features/<feature>/task-graph.json",
            role: "task-graph",
            mimeType: "application/json",
            requiredFor: ["handoff", "implementation", "checkpoint"],
            freshness: "hash-pinned"
          },
          {
            id: "context-pack",
            path: ".visp/features/<feature>/context/<task-id>.context.json",
            role: "context-pack",
            mimeType: "application/json",
            requiredFor: ["handoff", "implementation", "checkpoint"],
            freshness: "hash-pinned"
          },
          {
            id: "context-prompt",
            path: ".visp/features/<feature>/context/<task-id>.prompt.md",
            role: "prompt",
            mimeType: "text/markdown",
            requiredFor: ["implementation"],
            freshness: "read-latest"
          },
          {
            id: "current-task-prompt",
            path: ".visp/prompts/current-task.prompt.md",
            role: "prompt",
            mimeType: "text/markdown",
            requiredFor: ["implementation"],
            freshness: "read-latest"
          },
          {
            id: "implementation-checklist",
            path: ".visp/features/<feature>/context/<task-id>.implementation-checklist.json",
            role: "checklist",
            mimeType: "application/json",
            requiredFor: ["implementation", "pr"],
            freshness: "gate-validated"
          }
        ],
        freshnessPolicy: {
          contextPackHashPinned: true,
          provenanceArtifactsHashPinned: true,
          staleContextBlocks: ["implementation", "checkpoint", "pr"]
        }
      });
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
      capabilities: {
        governance: { failClosedGates: boolean };
        contextGrounding: { orchestratorReadContract: boolean };
      };
      orchestrator: { requiredArtifacts: Array<{ id: string }> };
    };
    expect(parsed.success).toBe(true);
    expect(parsed.contractVersion).toBe("2.0");
    expect(parsed.capabilities.governance.failClosedGates).toBe(true);
    expect(parsed.capabilities.contextGrounding.orchestratorReadContract).toBe(true);
    expect(parsed.orchestrator.requiredArtifacts.map((artifact) => artifact.id)).toContain(
      "context-pack"
    );
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
