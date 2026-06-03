import path from "node:path";

import {
  featurePrArtifactPath,
  featurePrMarkdownPath,
  promptArtifactPath,
  projectStatusArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import {
  projectStatusSchema,
  type ProjectStatus
} from "../artifacts/schemas/project.schema.js";
import { prArtifactSchema } from "../artifacts/schemas/pr.schema.js";
import { type CommandRunner } from "../core/command-runner.js";
import { VispError } from "../core/errors.js";
import { writeTextFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { ok, err, type Result } from "../core/result.js";
import { renderPrPrompt } from "../pr/pr-prompt.js";
import { renderPrMarkdown } from "../pr/pr-report.js";
import { buildPrArtifact } from "../pr/pr-summary.js";
import { loadGitDiff, type LoadedDiffFile } from "../review/diff-loader.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { loadProjectState } from "../orchestrator/project-state.js";

export type PrWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly base?: string;
  readonly staged?: boolean;
  readonly unstaged?: boolean;
  readonly title?: string;
  readonly promptOnly?: boolean;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
  readonly now?: string;
  readonly commandRunner?: CommandRunner;
};

export type PrSummary = {
  readonly success: boolean;
  readonly targetPath: string;
  readonly feature: {
    readonly id: string;
    readonly slug: string;
  };
  readonly task: {
    readonly id: string;
    readonly title: string;
  } | null;
  readonly title: string;
  readonly prPath: string | null;
  readonly prJsonPath: string | null;
  readonly promptPath: string | null;
  readonly evidenceSummary: {
    readonly verification: string;
    readonly review: string;
    readonly reconcile: string;
  };
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly nextCommand: string;
};

async function updateStatus(input: {
  readonly targetPath: string;
  readonly now: string;
}): Promise<Result<void, VispError>> {
  const status = await readArtifact(projectStatusArtifactPath(input.targetPath), projectStatusSchema, {
    artifactName: "project status"
  });

  if (!status.ok) return status;

  const nextStatus: ProjectStatus = {
    ...status.value,
    currentState: "pr_ready",
    lastCommand: "pr",
    updatedAt: input.now
  };
  const write = await writeArtifact(
    projectStatusArtifactPath(input.targetPath),
    projectStatusSchema,
    nextStatus,
    { artifactName: "project status" }
  );

  if (!write.ok) return write;
  return ok(undefined);
}

export async function runPrWorkflow(
  options: PrWorkflowOptions = {}
): Promise<Result<PrSummary, VispError>> {
  const state = await loadProjectState(options);

  if (!state.ok) return state;
  if (!state.value.initialized) {
    return err(new VispError("VALIDATION_FAILED", "Visp Kit is not initialized. Run `visp init` first."));
  }
  if (state.value.selectedFeature === undefined) {
    return err(new VispError("VALIDATION_FAILED", 'No active feature found. Run `visp feature "<idea>"` first or pass --feature.'));
  }
  if (state.value.errors.length > 0) {
    return err(new VispError("VALIDATION_FAILED", state.value.errors.join(" ")));
  }

  const feature = state.value.selectedFeature;
  const now = options.now ?? new Date().toISOString();
  const title = options.title ?? state.value.selectedFeature.intent?.title ?? `Feature ${feature.id}-${feature.slug}`;
  const diff = await loadGitDiff({
    targetPath: state.value.targetPath,
    base: options.base,
    staged: options.staged,
    unstaged: options.unstaged,
    commandRunner: options.commandRunner
  });
  const warnings: string[] = [];
  const changedFiles: readonly LoadedDiffFile[] = diff.ok ? diff.value.files : [];

  if (!diff.ok) {
    warnings.push(`Git diff unavailable: ${diff.error.message}`);
  }

  const pr = buildPrArtifact({
    state: state.value,
    title,
    changedFiles,
    warnings,
    generatedAt: now,
    taskId: options.taskId
  });
  const parsed = prArtifactSchema.safeParse(pr);

  if (!parsed.success) {
    return err(new VispError("VALIDATION_FAILED", `Generated PR artifact is invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}`));
  }

  const prJsonPath = featurePrArtifactPath(state.value.targetPath, feature.key);
  const prMdPath = featurePrMarkdownPath(state.value.targetPath, feature.key);
  const promptPath = promptArtifactPath(state.value.targetPath, "pr");
  const prompt = renderPrPrompt({ featureKey: feature.key });

  if (!options.dryRun) {
    const writePrompt = await writeTextFile(promptPath, prompt);

    if (!writePrompt.ok) return writePrompt;

    if (!options.promptOnly) {
      const writeJson = await writeArtifact(prJsonPath, prArtifactSchema, parsed.data, {
        artifactName: "PR summary"
      });

      if (!writeJson.ok) return writeJson;

      const writeMd = await writeTextFile(prMdPath, renderPrMarkdown(parsed.data));

      if (!writeMd.ok) return writeMd;

      const status = await updateStatus({
        targetPath: state.value.targetPath,
        now
      });

      if (!status.ok) return status;
    }
  }

  return ok({
    success: parsed.data.success,
    targetPath: state.value.targetPath,
    feature: {
      id: feature.id,
      slug: feature.slug
    },
    task: options.taskId === undefined || state.value.selectedTask === undefined
      ? null
      : {
          id: state.value.selectedTask.id,
          title: state.value.selectedTask.title
        },
    title,
    prPath: options.dryRun || options.promptOnly ? null : relativePath(state.value.targetPath, prMdPath),
    prJsonPath: options.dryRun || options.promptOnly ? null : relativePath(state.value.targetPath, prJsonPath),
    promptPath: options.dryRun ? null : relativePath(state.value.targetPath, promptPath),
    evidenceSummary: {
      verification: parsed.data.validationEvidence.status,
      review: parsed.data.reviewEvidence.status,
      reconcile: parsed.data.reconcileEvidence.status
    },
    warnings: parsed.data.warnings,
    errors: parsed.data.errors,
    nextCommand: "Review pr.md and use it in your pull request."
  });
}

export function formatPrSummary(summary: PrSummary): string {
  const lines = [
    formatHeader("Visp PR summary ready."),
    "",
    formatKeyValue("Feature", `${summary.feature.id}-${summary.feature.slug}`),
    formatKeyValue("Title", summary.title),
    "",
    "Evidence:",
    `  Verification: ${summary.evidenceSummary.verification}`,
    `  Review: ${summary.evidenceSummary.review}`,
    `  Reconcile: ${summary.evidenceSummary.reconcile}`
  ];

  if (summary.prPath !== null || summary.prJsonPath !== null || summary.promptPath !== null) {
    lines.push("", "Files:");
    if (summary.prPath !== null) lines.push(`  ${summary.prPath}`);
    if (summary.prJsonPath !== null) lines.push(`  ${summary.prJsonPath}`);
    if (summary.promptPath !== null) lines.push(`  ${summary.promptPath}`);
  }

  if (summary.warnings.length > 0) {
    lines.push("", "Warnings:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  if (summary.errors.length > 0) {
    lines.push("", "Errors:", ...summary.errors.map((error) => `  ${error}`));
  }

  lines.push("", "Next:", `  ${summary.nextCommand}`);

  return `${lines.join("\n")}\n`;
}
