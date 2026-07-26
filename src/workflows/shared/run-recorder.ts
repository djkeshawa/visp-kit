import { type RunEvent } from "../../artifacts/schemas/run.schema.js";
import { type WorkflowFileAction } from "./generated-files.js";
import { recordRun } from "../../runs/run-store.js";
import { wroteFile } from "../../agent/agent-file-plan.js";

export type WorkflowRunRecordResult = {
  readonly runId?: string;
  readonly writtenFiles: readonly string[];
  readonly warnings: readonly string[];
};

export async function recordWorkflowRun(input: {
  readonly targetPath: string;
  readonly command: string;
  readonly startedAt?: string;
  readonly endedAt: string;
  readonly feature?: {
    readonly id: string;
    readonly slug: string;
  };
  readonly taskId?: string;
  readonly success: boolean;
  readonly result?: "passed" | "warnings" | "failed";
  readonly actions?: readonly WorkflowFileAction[];
  readonly estimatedTokens?: number;
  readonly actualTokens?: number;
  readonly warnings?: readonly string[];
  readonly errors?: readonly string[];
  readonly events?: readonly Omit<RunEvent, "id" | "runId" | "command" | "createdAt">[];
  readonly dryRun: boolean;
}): Promise<WorkflowRunRecordResult> {
  const artifactWrites = (input.actions ?? [])
    .filter((action) => wroteFile(action.action))
    .map((action) => action.path);
  const run = await recordRun({
    targetPath: input.targetPath,
    command: input.command,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    featureId: input.feature?.id,
    featureSlug: input.feature?.slug,
    taskId: input.taskId,
    success: input.success,
    result: input.result,
    artifactWrites,
    estimatedTokens: input.estimatedTokens,
    actualTokens: input.actualTokens,
    warnings: input.warnings,
    errors: input.errors,
    events: input.events,
    dryRun: input.dryRun
  });

  if (!run.ok) {
    return {
      writtenFiles: [],
      warnings: [`Run trace skipped: ${run.error.message}`]
    };
  }

  return {
    runId: run.value.runId,
    writtenFiles: run.value.writtenFiles,
    warnings: []
  };
}
