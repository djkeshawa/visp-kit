import path from "node:path";

import {
  evaluationReportArtifactPath,
  gateReportArtifactPath,
  policyArtifactPath,
  runIndexArtifactPath,
  statusReportArtifactPath
} from "../artifacts/artifact-paths.js";
import { type GateBlockedCommand } from "../artifacts/schemas/gate.schema.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { evaluationReportSchema } from "../artifacts/schemas/evaluation.schema.js";
import { runIndexSchema } from "../artifacts/schemas/run.schema.js";
import { VispError } from "../core/errors.js";
import { pathExists, writeTextFile } from "../core/file-system.js";
import { err, ok, type Result } from "../core/result.js";
import { loadProjectState, type ProjectState } from "../orchestrator/project-state.js";
import { type NextStep } from "../orchestrator/next-step.js";
import { renderStatusMarkdown } from "../status/status-report.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { relativePath } from "../core/paths.js";
import { type CommandRunner } from "../core/command-runner.js";
import { loadEffectivePolicy } from "../policy/policy-loader.js";
import { overrideExpired } from "../overrides/override-expiry.js";
import { readOverrideStore } from "../overrides/override-store.js";
import { runNextWorkflow } from "./next.workflow.js";

export type StatusWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly verbose?: boolean;
  readonly writeReport?: boolean;
  readonly json?: boolean;
  readonly commandRunner?: CommandRunner;
};

export type StatusSummary = {
  readonly success: boolean;
  readonly targetPath: string;
  readonly project: {
    readonly name: string;
    readonly preset: string;
    readonly budgetMode: string;
    readonly packageManager: string;
    readonly languages: readonly string[];
    readonly frameworks: readonly string[];
  };
  readonly initialized: boolean;
  readonly scanned: boolean;
  readonly constitution: boolean;
  readonly activeFeature: {
    readonly id: string;
    readonly slug: string;
    readonly key: string;
  } | null;
  readonly activeTask: {
    readonly id: string;
    readonly title: string;
    readonly status: string;
  } | null;
  readonly featureState: string;
  readonly taskSummary: ProjectState["taskSummary"];
  readonly artifactSummary: ProjectState["artifactSummary"];
  readonly latestEvidence: {
    readonly context: string;
    readonly verification: string;
    readonly review: string;
    readonly reconcile: string;
    readonly pr: string;
  };
  readonly policyStatus: "valid" | "missing" | "invalid";
  readonly strictnessMode: string;
  readonly latestGate: string;
  readonly latestRun: string;
  readonly evaluation: string;
  readonly activeOverrideCount: number;
  readonly nextAllowedCommand: string;
  readonly implementationAllowed: boolean;
  readonly prAllowed: boolean;
  readonly blockedCommands: readonly GateBlockedCommand[];
  readonly warnings: readonly string[];
  readonly nextCommand: string;
  readonly reportPath: string | null;
};

function summaryFromState(input: {
  readonly state: ProjectState;
  readonly next: NextStep;
  readonly reportPath: string | null;
  readonly policyStatus: StatusSummary["policyStatus"];
  readonly strictnessMode: string;
  readonly latestGate: string;
  readonly latestRun: string;
  readonly evaluation: string;
  readonly activeOverrideCount: number;
  readonly overrideWarnings?: readonly string[];
}): StatusSummary {
  const state = input.state;

  return {
    success: state.initialized && state.errors.length === 0,
    targetPath: state.targetPath,
    project: {
      name: state.profile?.name ?? state.config?.projectId ?? "unknown",
      preset: state.config?.preset ?? "unknown",
      budgetMode: state.config?.budgetMode ?? "unknown",
      packageManager: state.profile?.packageManager ?? "unknown",
      languages: state.profile?.languages ?? [],
      frameworks: state.profile?.frameworks ?? []
    },
    initialized: state.initialized,
    scanned: state.scanned,
    constitution: state.constitution,
    activeFeature:
      state.selectedFeature === undefined
        ? null
        : {
            id: state.selectedFeature.id,
            slug: state.selectedFeature.slug,
            key: state.selectedFeature.key
          },
    activeTask:
      state.selectedTask === undefined
        ? null
        : {
            id: state.selectedTask.id,
            title: state.selectedTask.title,
            status: state.selectedTask.status
          },
    featureState: state.status?.currentState ?? "unknown",
    taskSummary: state.taskSummary,
    artifactSummary: state.artifactSummary,
    latestEvidence: {
      context: state.artifactSummary.context
        ? `${state.selectedTask?.id ?? "feature"} ready`
        : "missing",
      verification:
        state.verification === undefined
          ? "missing"
          : state.verification.success
            ? "passed"
            : "failed",
      review: state.review === undefined ? "missing" : state.review.result,
      reconcile: state.reconcile === undefined ? "missing" : state.reconcile.result,
      pr: state.artifactSummary.pr ? "ready" : "missing"
    },
    policyStatus: input.policyStatus,
    strictnessMode: input.strictnessMode,
    latestGate: input.latestGate,
    latestRun: input.latestRun,
    evaluation: input.evaluation,
    activeOverrideCount: input.activeOverrideCount,
    nextAllowedCommand: input.next.nextAllowedCommand ?? input.next.nextCommand,
    implementationAllowed: input.next.implementationAllowed ?? false,
    prAllowed: input.next.prAllowed ?? false,
    blockedCommands: input.next.blockedCommands ?? [],
    warnings: [
      ...new Set([...state.warnings, ...input.next.warnings, ...(input.overrideWarnings ?? [])])
    ],
    nextCommand: input.next.nextCommand,
    reportPath: input.reportPath
  };
}

async function loadPolicySummary(targetPath: string): Promise<{
  readonly status: StatusSummary["policyStatus"];
  readonly strictnessMode: string;
  readonly warnings: readonly string[];
}> {
  const exists = await pathExists(policyArtifactPath(targetPath));
  const loaded = await loadEffectivePolicy({
    targetPath,
    now: new Date().toISOString()
  });

  if (!loaded.ok) {
    return {
      status: "invalid",
      strictnessMode: "unknown",
      warnings: [loaded.error.message]
    };
  }

  return {
    status: exists.ok && exists.value ? "valid" : "missing",
    strictnessMode: loaded.value.policy.strictnessMode,
    warnings: loaded.value.warnings
  };
}

async function latestGateSummary(targetPath: string): Promise<string> {
  const exists = await pathExists(gateReportArtifactPath(targetPath));
  return exists.ok && exists.value ? "gate report available" : "missing";
}

async function latestRunSummary(targetPath: string): Promise<string> {
  const exists = await pathExists(runIndexArtifactPath(targetPath));

  if (!exists.ok || !exists.value) return "missing";

  const index = await readArtifact(runIndexArtifactPath(targetPath), runIndexSchema, {
    artifactName: "run index"
  });

  if (!index.ok || index.value.latestRunId === null) return "missing";
  const latest = index.value.runs.find((run) => run.id === index.value.latestRunId);
  return latest === undefined
    ? index.value.latestRunId
    : `${latest.id} ${latest.command} ${latest.result}`;
}

async function evaluationSummary(targetPath: string): Promise<string> {
  const exists = await pathExists(evaluationReportArtifactPath(targetPath));

  if (!exists.ok || !exists.value) return "missing";

  const report = await readArtifact(
    evaluationReportArtifactPath(targetPath),
    evaluationReportSchema,
    {
      artifactName: "evaluation report"
    }
  );

  if (!report.ok) return "invalid";
  return report.value.result;
}

async function activeOverrideCount(targetPath: string): Promise<{
  readonly count: number;
  readonly warnings: readonly string[];
}> {
  const now = new Date().toISOString();
  const store = await readOverrideStore(targetPath);

  if (!store.ok) {
    return {
      count: 0,
      warnings: [`Overrides unavailable: ${store.error.message}`]
    };
  }

  return {
    count: store.value.artifact.overrides.filter(
      (override) =>
        override.status === "active" && !overrideExpired({ expiresAt: override.expiresAt, now })
    ).length,
    warnings: []
  };
}

export async function runStatusWorkflow(
  options: StatusWorkflowOptions = {}
): Promise<Result<StatusSummary, VispError>> {
  const state = await loadProjectState(options);

  if (!state.ok) return state;
  if (!state.value.initialized) {
    return err(
      new VispError("VALIDATION_FAILED", "Visp Kit is not initialized. Run `visp init` first.", {
        recovery: "visp init"
      })
    );
  }
  if (state.value.errors.length > 0) {
    return err(new VispError("VALIDATION_FAILED", state.value.errors.join(" ")));
  }

  const next = await runNextWorkflow({
    targetPath: state.value.targetPath,
    feature: options.feature,
    taskId: options.taskId,
    commandRunner: options.commandRunner
  });

  if (!next.ok) return next;

  const policy = await loadPolicySummary(state.value.targetPath);
  const latestGate = await latestGateSummary(state.value.targetPath);
  const latestRun = await latestRunSummary(state.value.targetPath);
  const evaluation = await evaluationSummary(state.value.targetPath);
  const overrides = await activeOverrideCount(state.value.targetPath);
  let reportPath: string | null = null;

  if (options.writeReport) {
    const targetPath = path.resolve(options.cwd ?? process.cwd(), options.targetPath ?? ".");
    const absolute = statusReportArtifactPath(targetPath);
    const write = await writeTextFile(
      absolute,
      renderStatusMarkdown({
        state: state.value,
        next: next.value,
        verbose: options.verbose,
        policyStatus: policy.status,
        strictnessMode: policy.strictnessMode,
        latestGate,
        latestRun,
        evaluation,
        activeOverrideCount: overrides.count,
        overrideWarnings: overrides.warnings,
        blockedCommands: next.value.blockedCommands ?? []
      })
    );

    if (!write.ok) return write;
    reportPath = relativePath(targetPath, absolute);
  }

  return ok(
    summaryFromState({
      state: state.value,
      next: next.value,
      reportPath,
      policyStatus: policy.status,
      strictnessMode: policy.strictnessMode,
      latestGate,
      latestRun,
      evaluation,
      activeOverrideCount: overrides.count,
      overrideWarnings: overrides.warnings
    })
  );
}

export function formatStatusSummary(
  summary: StatusSummary,
  options: { readonly verbose?: boolean } = {}
): string {
  const lines = [
    formatHeader("Visp status"),
    "",
    formatKeyValue("Project", summary.project.name),
    formatKeyValue("Preset", summary.project.preset),
    formatKeyValue("Budget", summary.project.budgetMode),
    formatKeyValue("Package manager", summary.project.packageManager),
    "",
    "State:",
    `  Initialized: ${summary.initialized ? "yes" : "no"}`,
    `  Scanned: ${summary.scanned ? "yes" : "no"}`,
    `  Constitution: ${summary.constitution ? "yes" : "no"}`,
    "",
    "Policy:",
    `  Strictness: ${summary.strictnessMode}`,
    `  Policy: ${summary.policyStatus}`,
    `  Latest gate: ${summary.latestGate}`,
    `  Latest run: ${summary.latestRun}`,
    `  Evaluation: ${summary.evaluation}`,
    `  Active overrides: ${summary.activeOverrideCount}`,
    `  Implementation allowed: ${summary.implementationAllowed ? "yes" : "no"}`,
    `  PR allowed: ${summary.prAllowed ? "yes" : "no"}`,
    "",
    "Active feature:",
    `  ${summary.activeFeature === null ? "none" : `${summary.activeFeature.id}-${summary.activeFeature.slug}`}`,
    "",
    "Tasks:",
    `  Ready: ${summary.taskSummary.ready}`,
    `  Pending: ${summary.taskSummary.pending}`,
    `  Verified: ${summary.taskSummary.verified}`,
    "",
    "Latest evidence:",
    `  Context: ${summary.latestEvidence.context}`,
    `  Verification: ${summary.latestEvidence.verification}`,
    `  Review: ${summary.latestEvidence.review}`,
    `  Reconcile: ${summary.latestEvidence.reconcile}`,
    "",
    "Next:",
    `  ${summary.nextAllowedCommand}`
  ];

  if (options.verbose) {
    lines.push(
      "",
      "Project detail:",
      `  Languages: ${summary.project.languages.length === 0 ? "unknown" : summary.project.languages.join(", ")}`,
      `  Frameworks: ${summary.project.frameworks.length === 0 ? "none" : summary.project.frameworks.join(", ")}`,
      "",
      "Artifacts:",
      `  Clarifications: ${summary.artifactSummary.clarifications ? "yes" : "no"}`,
      `  Spec: ${summary.artifactSummary.spec ? "yes" : "no"}`,
      `  Plan: ${summary.artifactSummary.plan ? "yes" : "no"}`,
      `  Task graph: ${summary.artifactSummary.taskGraph ? "yes" : "no"}`,
      `  Traceability: ${summary.artifactSummary.traceability ? "yes" : "no"}`,
      `  PR summary: ${summary.artifactSummary.pr ? "yes" : "no"}`
    );
  }

  if (summary.reportPath !== null) {
    lines.push("", "Report:", `  ${summary.reportPath}`);
  }

  if (summary.warnings.length > 0) {
    lines.push("", "Warnings:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  return `${lines.join("\n")}\n`;
}
