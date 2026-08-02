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
import {
  DEFAULT_WORKFLOW_ACTION_PROTOCOL,
  SUPPORTED_WORKFLOW_ACTION_PROTOCOLS,
  WORKFLOW_ACTION_SCHEMA_HASHES
} from "../../../src/integration/workflow-action-schema.js";
import {
  formatIntegrationContractSummary,
  runIntegrationContractWorkflow
} from "../../../src/workflows/integration.workflow.js";
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

const EXPECTED_WORKFLOW_ACTION_PROTOCOLS = {
  supported: ["2.0", "3.0", "3.1", "3.2", "3.4"],
  default: "2.0",
  schemaHashes: {
    "2.0": "sha256:c63b279b1ce89f047b2be696a47e845a57adda7f8437892e211e3a4cfad39ed6",
    "3.0": "sha256:ceb45ad3a27a4172c4dbe7e7caacf473570f4578eda27744662a8ed094e96ce7",
    "3.1": "sha256:41ffa28fcd4476ea1812ff307df67a7ab7edb5b2cf4d6c11955d34d4aad74d4d",
    "3.2": "sha256:77dcaba51ef8e1a78064680077f8bcc48c081d8025596c6cc8df9ea7873d68e9",
    "3.4": "sha256:bee85bf783a3557c99c9feb716e967997595dfa228380be71815da531f055ca5"
  }
} as const;

describe("integration contract workflow", () => {
  it("returns a read-only contract for an uninitialized project", async () => {
    const targetPath = await mkdtemp(join(tmpdir(), "visp-contract-empty-"));

    const result = await runIntegrationContractWorkflow({ targetPath });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.initialized).toBe(false);
      expect(result.value.contractVersion).toBe("2.0");
      expect(result.value.protocols.workflowAction).toEqual(EXPECTED_WORKFLOW_ACTION_PROTOCOLS);
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
      expect(result.value.protocols.workflowAction).toEqual(EXPECTED_WORKFLOW_ACTION_PROTOCOLS);
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

  it("advertises one immutable and coherent WorkflowAction compatibility contract", async () => {
    const targetPath = await mkdtemp(join(tmpdir(), "visp-contract-protocols-"));

    const first = await runIntegrationContractWorkflow({ targetPath });
    const second = await runIntegrationContractWorkflow({ targetPath });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      const advertised = first.value.protocols.workflowAction;
      expect(advertised).toEqual(EXPECTED_WORKFLOW_ACTION_PROTOCOLS);
      expect(advertised.supported).toBe(SUPPORTED_WORKFLOW_ACTION_PROTOCOLS);
      expect(advertised.default).toBe(DEFAULT_WORKFLOW_ACTION_PROTOCOL);
      expect(advertised.schemaHashes).toBe(WORKFLOW_ACTION_SCHEMA_HASHES);
      expect(Object.keys(first.value.protocols)).toEqual(["workflowAction"]);
      expect(Object.keys(advertised)).toEqual(["supported", "default", "schemaHashes"]);
      expect(new Set(advertised.supported).size).toBe(advertised.supported.length);
      expect(advertised.supported).toContain(advertised.default);
      expect(Object.keys(advertised.schemaHashes)).toEqual([...advertised.supported]);
      expect(Object.values(advertised.schemaHashes)).toEqual(
        advertised.supported.map(() => expect.stringMatching(/^sha256:[a-f0-9]{64}$/u))
      );
      expect(Object.isFrozen(first.value.protocols)).toBe(true);
      expect(Object.isFrozen(advertised)).toBe(true);
      expect(Object.isFrozen(advertised.supported)).toBe(true);
      expect(Object.isFrozen(advertised.schemaHashes)).toBe(true);
      expect(second.value.protocols).toEqual(first.value.protocols);
      expect(first.value.contractVersion).toBe("2.0");
      expect(first.value.orchestrator.readContractVersion).toBe("0.1");
    }
  });

  it("locks the bounded contract 2.0 command, read-role, freshness, and fail-closed surface", async () => {
    const targetPath = await mkdtemp(join(tmpdir(), "visp-contract-bounded-"));
    const pkg = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
      version: string;
    };

    const result = await runIntegrationContractWorkflow({ targetPath });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const { protocols, ...legacyContract } = result.value;
      expect(protocols.workflowAction).toEqual(EXPECTED_WORKFLOW_ACTION_PROTOCOLS);
      expect(Object.keys(legacyContract)).toEqual([
        "success",
        "contractVersion",
        "kit",
        "targetPath",
        "initialized",
        "activeFeature",
        "activeTask",
        "commands",
        "capabilities",
        "workflow",
        "artifacts",
        "orchestrator",
        "warnings"
      ]);
      expect(legacyContract.success).toBe(true);
      expect(legacyContract.contractVersion).toBe("2.0");
      expect(legacyContract.kit).toEqual({
        packageName: "visp-kit",
        cliName: "visp",
        version: pkg.version
      });
      expect(legacyContract.kit.version).toMatch(/^\d+\.\d+\.\d+/u);
      expect(legacyContract.targetPath).toBe(targetPath);
      expect(legacyContract.initialized).toBe(false);
      expect(legacyContract.activeFeature).toBeNull();
      expect(legacyContract.activeTask).toBeNull();
      expect(legacyContract.commands).toEqual({
        status: ["status", "--json"],
        policyValidate: ["policy", "validate", "--json"],
        gateNext: ["gate", "next", "--json"],
        gateImplement: ["gate", "implement", "--task", "<task-id>", "--json"],
        context: ["context", "<task-id>", "--json"],
        verify: ["verify", "--task", "<task-id>", "--json"],
        review: ["review", "--task", "<task-id>", "--json"],
        reconcile: ["reconcile", "--task", "<task-id>", "--json"],
        budgetRecordUsage: ["budget", "--task", "<task-id>", "--record-usage", "--json"],
        done: ["done", "--task", "<task-id>", "--json"],
        hooksClaude: ["hooks", "claude", "--json"],
        hooksGit: ["hooks", "git", "--json"],
        hooksCi: ["hooks", "ci", "--json"]
      });
      expect(legacyContract.capabilities).toEqual({
        deterministic: {
          noLlmCalls: true,
          localArtifacts: true,
          jsonOutput: true
        },
        governance: {
          policyAsCode: true,
          failClosedGates: true,
          overrideAuditTrail: true,
          sourceEditsRequireImplementGate: true,
          contextPackRequiredForImplementation: true
        },
        contextGrounding: {
          phaseLevelArtifacts: true,
          taskScopedContextPacks: true,
          artifactProvenance: true,
          currentTaskPrompt: true,
          implementationChecklist: true,
          orchestratorReadContract: true
        },
        evidence: {
          verification: true,
          review: true,
          reconciliation: true,
          traceability: true,
          budgetTelemetry: true,
          prReadiness: true
        },
        enforcementSurfaces: {
          claudePreToolUseHook: true,
          gitPreCommitHook: true,
          ciPolicyGate: true
        }
      });
      expect(legacyContract.workflow).toEqual({
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
      expect(legacyContract.artifacts).toEqual({
        kitSignals: [".visp/policy.json", ".visp/project.json"],
        projectStatus: ".visp/status.json",
        projectProfile: ".visp/project.json",
        featureRoot: ".visp/features",
        featureDir: ".visp/features/<feature>",
        taskGraph: ".visp/features/<feature>/task-graph.json",
        contextPack: ".visp/features/<feature>/context/<task-id>.context.json",
        contextPrompt: ".visp/features/<feature>/context/<task-id>.prompt.md"
      });
      expect(legacyContract.orchestrator).toEqual({
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
      expect(legacyContract.warnings).toEqual([
        "Visp Kit is not initialized.",
        "Git repository unavailable."
      ]);
    }
  });

  it("preserves the exact human integration summary", async () => {
    const targetPath = await mkdtemp(join(tmpdir(), "visp-contract-summary-"));

    const result = await runIntegrationContractWorkflow({ targetPath });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(formatIntegrationContractSummary(result.value)).toBe(
        [
          "Visp integration contract",
          "",
          "Contract: 2.0",
          `Kit: visp-kit ${result.value.kit.version}`,
          "Initialized: no",
          "Active feature: none",
          "Active task: none",
          "Fail-closed gates: yes",
          "",
          "Artifacts:",
          "  Task graph: .visp/features/<feature>/task-graph.json",
          "  Context pack: .visp/features/<feature>/context/<task-id>.context.json",
          "  Orchestrator read contract: 8 artifacts",
          "",
          "Warnings:",
          "  Visp Kit is not initialized.",
          "  Git repository unavailable.",
          ""
        ].join("\n")
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
      protocols: { workflowAction: typeof EXPECTED_WORKFLOW_ACTION_PROTOCOLS };
      capabilities: {
        governance: { failClosedGates: boolean };
        contextGrounding: { orchestratorReadContract: boolean };
      };
      orchestrator: { requiredArtifacts: Array<{ id: string }> };
    };
    expect(parsed.success).toBe(true);
    expect(parsed.contractVersion).toBe("2.0");
    expect(parsed.protocols.workflowAction).toEqual(EXPECTED_WORKFLOW_ACTION_PROTOCOLS);
    expect(Object.keys(parsed).slice(0, 4)).toEqual([
      "success",
      "contractVersion",
      "protocols",
      "kit"
    ]);
    expect(Object.keys(parsed.protocols)).toEqual(["workflowAction"]);
    expect(Object.keys(parsed.protocols.workflowAction)).toEqual([
      "supported",
      "default",
      "schemaHashes"
    ]);
    expect(Object.keys(parsed.protocols.workflowAction.schemaHashes)).toEqual([
      "2.0",
      "3.0",
      "3.1",
      "3.2",
      "3.4"
    ]);
    expect(output.join("")).toBe(`${JSON.stringify(parsed, null, 2)}\n`);
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
