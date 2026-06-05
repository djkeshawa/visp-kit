import path from "node:path";

import { workflowManifestArtifactPath } from "../artifacts/artifact-paths.js";
import { workflowManifestSchema } from "../artifacts/schemas/workflow.schema.js";
import { VispError } from "../core/errors.js";
import { relativePath } from "../core/paths.js";
import { ok, type Result } from "../core/result.js";
import { loadWorkflowManifest } from "../workflow-manifest/workflow-loader.js";
import { renderWorkflowMarkdown } from "../workflow-manifest/workflow-renderer.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";

export type WorkflowCommandOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly json?: boolean;
  readonly now?: string;
};

export type WorkflowSummary = {
  readonly success: boolean;
  readonly targetPath: string;
  readonly exists: boolean;
  readonly valid: boolean;
  readonly manifestPath: string;
  readonly stageCount: number;
  readonly stages: readonly {
    readonly name: string;
    readonly command: string;
    readonly gateStage: string | null;
    readonly sourceEditsAllowed: boolean;
    readonly nextCommand: string;
  }[];
  readonly warnings: readonly string[];
  readonly markdown: string;
};

export async function runWorkflowShowWorkflow(
  options: WorkflowCommandOptions = {}
): Promise<Result<WorkflowSummary, VispError>> {
  const targetPath = path.resolve(options.cwd ?? process.cwd(), options.targetPath ?? ".");
  const now = options.now ?? new Date().toISOString();
  const loaded = await loadWorkflowManifest({ targetPath, now });

  if (!loaded.ok) return loaded;

  const validation = workflowManifestSchema.safeParse(loaded.value.manifest);

  return ok({
    success: validation.success,
    targetPath,
    exists: loaded.value.exists,
    valid: validation.success,
    manifestPath: relativePath(targetPath, workflowManifestArtifactPath(targetPath)),
    stageCount: loaded.value.manifest.stages.length,
    stages: loaded.value.manifest.stages.map((stage) => ({
      name: stage.name,
      command: stage.command,
      gateStage: stage.gateStage ?? null,
      sourceEditsAllowed: stage.sourceEditsAllowed,
      nextCommand: stage.nextCommand
    })),
    warnings: loaded.value.warnings,
    markdown: renderWorkflowMarkdown(loaded.value.manifest)
  });
}

export async function runWorkflowValidateWorkflow(
  options: WorkflowCommandOptions = {}
): Promise<Result<WorkflowSummary, VispError>> {
  return runWorkflowShowWorkflow(options);
}

export function formatWorkflowCommandSummary(summary: WorkflowSummary): string {
  const lines = [
    formatHeader("Visp workflow"),
    "",
    formatKeyValue("Manifest", summary.exists ? "project" : "built-in"),
    formatKeyValue("Valid", summary.valid ? "yes" : "no"),
    formatKeyValue("Stages", String(summary.stageCount)),
    "",
    "Stages:",
    ...summary.stages.map((stage) => `  ${stage.name}: ${stage.command}`)
  ];

  if (summary.warnings.length > 0) {
    lines.push("", "Warnings:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  return `${lines.join("\n")}\n`;
}
