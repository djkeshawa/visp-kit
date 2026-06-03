import path from "node:path";

import { statusReportArtifactPath } from "../artifacts/artifact-paths.js";
import { VispError } from "../core/errors.js";
import { writeTextFile } from "../core/file-system.js";
import { err, ok, type Result } from "../core/result.js";
import {
  loadProjectState,
  type ProjectState
} from "../orchestrator/project-state.js";
import {
  recommendNextStep,
  type NextStep
} from "../orchestrator/next-step.js";
import { renderStatusMarkdown } from "../status/status-report.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { relativePath } from "../core/paths.js";
import { type CommandRunner } from "../core/command-runner.js";

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
  readonly warnings: readonly string[];
  readonly nextCommand: string;
  readonly reportPath: string | null;
};

function summaryFromState(input: {
  readonly state: ProjectState;
  readonly next: NextStep;
  readonly reportPath: string | null;
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
    activeFeature: state.selectedFeature === undefined
      ? null
      : {
          id: state.selectedFeature.id,
          slug: state.selectedFeature.slug,
          key: state.selectedFeature.key
        },
    activeTask: state.selectedTask === undefined
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
      context: state.artifactSummary.context ? `${state.selectedTask?.id ?? "feature"} ready` : "missing",
      verification: state.verification === undefined ? "missing" : state.verification.success ? "passed" : "failed",
      review: state.review === undefined ? "missing" : state.review.result,
      reconcile: state.reconcile === undefined ? "missing" : state.reconcile.result,
      pr: state.artifactSummary.pr ? "ready" : "missing"
    },
    warnings: [...new Set([...state.warnings, ...input.next.warnings])],
    nextCommand: input.next.nextCommand,
    reportPath: input.reportPath
  };
}

export async function runStatusWorkflow(
  options: StatusWorkflowOptions = {}
): Promise<Result<StatusSummary, VispError>> {
  const state = await loadProjectState(options);

  if (!state.ok) return state;
  if (!state.value.initialized) {
    return err(new VispError("VALIDATION_FAILED", "Visp Kit is not initialized. Run `visp init` first."));
  }
  if (state.value.errors.length > 0) {
    return err(new VispError("VALIDATION_FAILED", state.value.errors.join(" ")));
  }

  const next = recommendNextStep({
    state: state.value,
    taskId: options.taskId
  });
  let reportPath: string | null = null;

  if (options.writeReport) {
    const targetPath = path.resolve(options.cwd ?? process.cwd(), options.targetPath ?? ".");
    const absolute = statusReportArtifactPath(targetPath);
    const write = await writeTextFile(
      absolute,
      renderStatusMarkdown({
        state: state.value,
        next,
        verbose: options.verbose
      })
    );

    if (!write.ok) return write;
    reportPath = relativePath(targetPath, absolute);
  }

  return ok(summaryFromState({
    state: state.value,
    next,
    reportPath
  }));
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
    `  ${summary.nextCommand}`
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
