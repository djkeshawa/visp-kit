import {
  contextPackArtifactPath,
  contextPromptPath,
  featureArtifactDir,
  featuresArtifactDir,
  policyArtifactPath,
  projectProfileArtifactPath,
  projectStatusArtifactPath,
  taskGraphArtifactPath
} from "../artifacts/artifact-paths.js";
import { packageVersion } from "../core/package-version.js";
import { relativePath } from "../core/paths.js";
import { ok, type Result } from "../core/result.js";
import { VispError } from "../core/errors.js";
import { loadProjectState } from "../orchestrator/project-state.js";

export type IntegrationContractOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
};

export type IntegrationContractSummary = {
  readonly success: true;
  readonly contractVersion: "1.1";
  readonly kit: {
    readonly packageName: "visp-kit";
    readonly cliName: "visp";
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
      readonly currentTaskPrompt: true;
      readonly implementationChecklist: true;
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
  readonly warnings: readonly string[];
};

const COMMANDS: Record<string, readonly string[]> = {
  status: ["status", "--json"],
  policyValidate: ["policy", "validate", "--json"],
  gateNext: ["gate", "next", "--json"],
  gateImplement: ["gate", "implement", "--task", "<task-id>", "--json"],
  context: ["context", "--task", "<task-id>", "--json"],
  verify: ["verify", "--task", "<task-id>", "--json"],
  review: ["review", "--task", "<task-id>", "--json"],
  reconcile: ["reconcile", "--task", "<task-id>", "--json"],
  budgetRecordUsage: ["budget", "--task", "<task-id>", "--record-usage", "--json"],
  done: ["done", "--task", "<task-id>", "--json"],
  hooksClaude: ["hooks", "claude", "--json"],
  hooksGit: ["hooks", "git", "--json"],
  hooksCi: ["hooks", "ci", "--json"]
};

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
    currentTaskPrompt: true,
    implementationChecklist: true
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

  return ok({
    success: true,
    contractVersion: "1.1",
    kit: {
      packageName: "visp-kit",
      cliName: "visp",
      version: packageVersion()
    },
    targetPath,
    initialized: state.value.initialized,
    activeFeature: state.value.selectedFeature === undefined
      ? null
      : {
          id: state.value.selectedFeature.id,
          slug: state.value.selectedFeature.slug,
          key: state.value.selectedFeature.key,
          path: state.value.selectedFeature.relativePath
        },
    activeTask: state.value.selectedTask === undefined
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
      kitSignals: [
        relativePath(targetPath, policyArtifactPath(targetPath)),
        relativePath(targetPath, projectProfileArtifactPath(targetPath))
      ],
      projectStatus: relativePath(targetPath, projectStatusArtifactPath(targetPath)),
      projectProfile: relativePath(targetPath, projectProfileArtifactPath(targetPath)),
      featureRoot: relativePath(targetPath, featuresArtifactDir(targetPath)),
      featureDir: state.value.selectedFeature === undefined
        ? ".visp/features/<feature>"
        : relativePath(targetPath, featureArtifactDir(targetPath, featureKey)),
      taskGraph: state.value.selectedFeature === undefined
        ? ".visp/features/<feature>/task-graph.json"
        : relativePath(targetPath, taskGraphArtifactPath(targetPath, featureKey)),
      contextPack: state.value.selectedFeature === undefined
        ? ".visp/features/<feature>/context/<task-id>.context.json"
        : relativePath(targetPath, contextPackArtifactPath(targetPath, featureKey, taskId)),
      contextPrompt: state.value.selectedFeature === undefined
        ? ".visp/features/<feature>/context/<task-id>.prompt.md"
        : relativePath(targetPath, contextPromptPath(targetPath, featureKey, taskId))
    },
    warnings: state.value.warnings
  });
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
    `  Context pack: ${summary.artifacts.contextPack}`
  ];

  if (summary.warnings.length > 0) {
    lines.push("", "Warnings:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  return `${lines.join("\n")}\n`;
}
