import {
  contextChecklistJsonPath,
  contextPackArtifactPath,
  contextPromptPath,
  featureArtifactDir,
  featuresArtifactDir,
  policyArtifactPath,
  promptArtifactPath,
  projectProfileArtifactPath,
  projectStatusArtifactPath,
  taskGraphArtifactPath
} from "../artifacts/artifact-paths.js";
import { packageVersion } from "../core/package-version.js";
import { relativePath } from "../core/paths.js";
import { ok, type Result } from "../core/result.js";
import { type VispError } from "../core/errors.js";
import {
  DEFAULT_WORKFLOW_ACTION_PROTOCOL,
  SUPPORTED_WORKFLOW_ACTION_PROTOCOLS,
  WORKFLOW_ACTION_SCHEMA_HASHES
} from "../integration/workflow-action-schema.js";
import { loadProjectState } from "../orchestrator/project-state.js";

export type IntegrationContractOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
};

export type IntegrationContractSummary = {
  readonly success: true;
  readonly contractVersion: "2.0";
  readonly protocols: {
    readonly workflowAction: {
      readonly supported: typeof SUPPORTED_WORKFLOW_ACTION_PROTOCOLS;
      readonly default: typeof DEFAULT_WORKFLOW_ACTION_PROTOCOL;
      readonly schemaHashes: typeof WORKFLOW_ACTION_SCHEMA_HASHES;
    };
  };
  readonly kit: {
    readonly packageName: "visp-kit";
    readonly cliName: "visp-kit";
    readonly version: string;
  };
  readonly targetPath: string;
  readonly initialized: boolean;
  readonly activeFeature: {
    readonly id: string;
    readonly slug: string;
    readonly key: string;
    readonly path: string;
  } | null;
  readonly activeTask: {
    readonly id: string;
    readonly title: string;
    readonly status: string;
  } | null;
  readonly commands: Record<string, readonly string[]>;
  readonly capabilities: {
    readonly deterministic: {
      readonly noLlmCalls: true;
      readonly localArtifacts: true;
      readonly jsonOutput: true;
    };
    readonly governance: {
      readonly policyAsCode: true;
      readonly failClosedGates: true;
      readonly overrideAuditTrail: true;
      readonly sourceEditsRequireImplementGate: true;
      readonly contextPackRequiredForImplementation: true;
    };
    readonly contextGrounding: {
      readonly phaseLevelArtifacts: true;
      readonly taskScopedContextPacks: true;
      readonly artifactProvenance: true;
      readonly currentTaskPrompt: true;
      readonly implementationChecklist: true;
      readonly orchestratorReadContract: true;
    };
    readonly evidence: {
      readonly verification: true;
      readonly review: true;
      readonly reconciliation: true;
      readonly traceability: true;
      readonly budgetTelemetry: true;
      readonly prReadiness: true;
    };
    readonly enforcementSurfaces: {
      readonly claudePreToolUseHook: true;
      readonly gitPreCommitHook: true;
      readonly ciPolicyGate: true;
    };
  };
  readonly workflow: {
    readonly strictSequence: readonly string[];
    readonly implementationReadSet: readonly string[];
    readonly checkpointSequence: readonly string[];
    readonly failClosedOn: readonly string[];
    readonly freshnessChecks: readonly string[];
    readonly humanOverride: {
      readonly requiresReason: true;
      readonly command: readonly string[];
      readonly artifact: string;
    };
  };
  readonly artifacts: {
    readonly kitSignals: readonly string[];
    readonly projectStatus: string;
    readonly projectProfile: string;
    readonly featureRoot: string;
    readonly featureDir: string;
    readonly taskGraph: string;
    readonly contextPack: string;
    readonly contextPrompt: string;
  };
  readonly orchestrator: {
    readonly readContractVersion: "0.1";
    readonly requiredArtifacts: readonly OrchestratorReadArtifact[];
    readonly freshnessPolicy: {
      readonly contextPackHashPinned: true;
      readonly provenanceArtifactsHashPinned: true;
      readonly staleContextBlocks: readonly string[];
    };
  };
  readonly warnings: readonly string[];
};

export type OrchestratorReadArtifact = {
  readonly id: string;
  readonly path: string;
  readonly role:
    | "state"
    | "policy"
    | "profile"
    | "task-graph"
    | "context-pack"
    | "prompt"
    | "checklist";
  readonly mimeType: "application/json" | "text/markdown";
  readonly requiredFor: readonly string[];
  readonly freshness: "read-latest" | "hash-pinned" | "gate-validated";
};

const COMMANDS: Record<string, readonly string[]> = {
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
};

const WORKFLOW_ACTION_PROTOCOL_CONTRACT = Object.freeze({
  supported: SUPPORTED_WORKFLOW_ACTION_PROTOCOLS,
  default: DEFAULT_WORKFLOW_ACTION_PROTOCOL,
  schemaHashes: WORKFLOW_ACTION_SCHEMA_HASHES
});

const PROTOCOLS: IntegrationContractSummary["protocols"] = Object.freeze({
  workflowAction: WORKFLOW_ACTION_PROTOCOL_CONTRACT
});

const CAPABILITIES: IntegrationContractSummary["capabilities"] = {
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
};

const WORKFLOW_CONTRACT: IntegrationContractSummary["workflow"] = {
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
  failClosedOn: ["policyValidate", "gateNext", "gateImplement", "verify", "review", "reconcile"],
  freshnessChecks: [
    ".visp/features/<feature>/context/<task-id>.context.json",
    "contextPack.artifactProvenance[]"
  ],
  humanOverride: {
    requiresReason: true,
    command: ["override", "create", "<rule-id>", "--reason", "<reason>", "--json"],
    artifact: ".visp/overrides.json"
  }
};

export async function runIntegrationContractWorkflow(
  options: IntegrationContractOptions = {}
): Promise<Result<IntegrationContractSummary, VispError>> {
  const state = await loadProjectState(options);
  if (!state.ok) return state;

  const targetPath = state.value.targetPath;
  const featureKey = state.value.selectedFeature?.key ?? "<feature>";
  const taskId = state.value.selectedTask?.id ?? state.value.status?.activeTaskId ?? "<task-id>";
  const artifacts = {
    kitSignals: [
      relativePath(targetPath, policyArtifactPath(targetPath)),
      relativePath(targetPath, projectProfileArtifactPath(targetPath))
    ],
    projectStatus: relativePath(targetPath, projectStatusArtifactPath(targetPath)),
    projectProfile: relativePath(targetPath, projectProfileArtifactPath(targetPath)),
    featureRoot: relativePath(targetPath, featuresArtifactDir(targetPath)),
    featureDir:
      state.value.selectedFeature === undefined
        ? ".visp/features/<feature>"
        : relativePath(targetPath, featureArtifactDir(targetPath, featureKey)),
    taskGraph:
      state.value.selectedFeature === undefined
        ? ".visp/features/<feature>/task-graph.json"
        : relativePath(targetPath, taskGraphArtifactPath(targetPath, featureKey)),
    contextPack:
      state.value.selectedFeature === undefined
        ? ".visp/features/<feature>/context/<task-id>.context.json"
        : relativePath(targetPath, contextPackArtifactPath(targetPath, featureKey, taskId)),
    contextPrompt:
      state.value.selectedFeature === undefined
        ? ".visp/features/<feature>/context/<task-id>.prompt.md"
        : relativePath(targetPath, contextPromptPath(targetPath, featureKey, taskId)),
    currentTaskPrompt: relativePath(targetPath, promptArtifactPath(targetPath, "current-task")),
    implementationChecklist:
      state.value.selectedFeature === undefined
        ? ".visp/features/<feature>/context/<task-id>.implementation-checklist.json"
        : relativePath(targetPath, contextChecklistJsonPath(targetPath, featureKey, taskId))
  };

  return ok({
    success: true,
    contractVersion: "2.0",
    protocols: PROTOCOLS,
    kit: {
      packageName: "visp-kit",
      // The command this package actually installs. It said "visp" until 0.4.0
      // released that name to visp-hyper-agent (ADR 0005) — after which the
      // contract was telling every consumer to spawn a command this package no
      // longer provides, and which now belongs to the coordinator. A contract
      // that misreports its own entry point is worse than one that omits it.
      cliName: "visp-kit",
      version: packageVersion()
    },
    targetPath,
    initialized: state.value.initialized,
    activeFeature:
      state.value.selectedFeature === undefined
        ? null
        : {
            id: state.value.selectedFeature.id,
            slug: state.value.selectedFeature.slug,
            key: state.value.selectedFeature.key,
            path: state.value.selectedFeature.relativePath
          },
    activeTask:
      state.value.selectedTask === undefined
        ? null
        : {
            id: state.value.selectedTask.id,
            title: state.value.selectedTask.title,
            status: state.value.selectedTask.status
          },
    commands: COMMANDS,
    capabilities: CAPABILITIES,
    workflow: WORKFLOW_CONTRACT,
    artifacts: {
      kitSignals: artifacts.kitSignals,
      projectStatus: artifacts.projectStatus,
      projectProfile: artifacts.projectProfile,
      featureRoot: artifacts.featureRoot,
      featureDir: artifacts.featureDir,
      taskGraph: artifacts.taskGraph,
      contextPack: artifacts.contextPack,
      contextPrompt: artifacts.contextPrompt
    },
    orchestrator: buildOrchestratorContract(artifacts),
    warnings: state.value.warnings
  });
}

function buildOrchestratorContract(artifacts: {
  readonly kitSignals: readonly string[];
  readonly projectStatus: string;
  readonly projectProfile: string;
  readonly taskGraph: string;
  readonly contextPack: string;
  readonly contextPrompt: string;
  readonly currentTaskPrompt: string;
  readonly implementationChecklist: string;
}): IntegrationContractSummary["orchestrator"] {
  return {
    readContractVersion: "0.1",
    requiredArtifacts: [
      {
        id: "project-status",
        path: artifacts.projectStatus,
        role: "state",
        mimeType: "application/json",
        requiredFor: ["handoff", "gate-evaluation"],
        freshness: "read-latest"
      },
      {
        id: "project-policy",
        path: artifacts.kitSignals[0] ?? ".visp/policy.json",
        role: "policy",
        mimeType: "application/json",
        requiredFor: ["handoff", "implementation", "verification"],
        freshness: "gate-validated"
      },
      {
        id: "project-profile",
        path: artifacts.projectProfile,
        role: "profile",
        mimeType: "application/json",
        requiredFor: ["handoff", "implementation"],
        freshness: "read-latest"
      },
      {
        id: "task-graph",
        path: artifacts.taskGraph,
        role: "task-graph",
        mimeType: "application/json",
        requiredFor: ["handoff", "implementation", "checkpoint"],
        freshness: "hash-pinned"
      },
      {
        id: "context-pack",
        path: artifacts.contextPack,
        role: "context-pack",
        mimeType: "application/json",
        requiredFor: ["handoff", "implementation", "checkpoint"],
        freshness: "hash-pinned"
      },
      {
        id: "context-prompt",
        path: artifacts.contextPrompt,
        role: "prompt",
        mimeType: "text/markdown",
        requiredFor: ["implementation"],
        freshness: "read-latest"
      },
      {
        id: "current-task-prompt",
        path: artifacts.currentTaskPrompt,
        role: "prompt",
        mimeType: "text/markdown",
        requiredFor: ["implementation"],
        freshness: "read-latest"
      },
      {
        id: "implementation-checklist",
        path: artifacts.implementationChecklist,
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
  };
}

export function formatIntegrationContractSummary(summary: IntegrationContractSummary): string {
  const lines = [
    "Visp integration contract",
    "",
    `Contract: ${summary.contractVersion}`,
    `Kit: ${summary.kit.packageName} ${summary.kit.version}`,
    `Initialized: ${summary.initialized ? "yes" : "no"}`,
    `Active feature: ${summary.activeFeature?.key ?? "none"}`,
    `Active task: ${summary.activeTask?.id ?? "none"}`,
    `Fail-closed gates: ${summary.capabilities.governance.failClosedGates ? "yes" : "no"}`,
    "",
    "Artifacts:",
    `  Task graph: ${summary.artifacts.taskGraph}`,
    `  Context pack: ${summary.artifacts.contextPack}`,
    `  Orchestrator read contract: ${summary.orchestrator.requiredArtifacts.length} artifacts`
  ];

  if (summary.warnings.length > 0) {
    lines.push("", "Warnings:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  return `${lines.join("\n")}\n`;
}
