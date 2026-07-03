import {
  runArtifactPath,
  runEventsPath,
  runIndexArtifactPath,
  runMarkdownPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import {
  runArtifactSchema,
  runEventSchema,
  runIndexSchema,
  type RunArtifact,
  type RunEvent,
  type RunIndex
} from "../artifacts/schemas/run.schema.js";
import { type VispError } from "../core/errors.js";
import { pathExists, writeTextFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { ok, type Result } from "../core/result.js";
import { eventId, nextRunId } from "./run-id.js";
import { renderRunMarkdown } from "./run-report.js";

export type RecordRunInput = {
  readonly targetPath: string;
  readonly command: string;
  readonly startedAt?: string;
  readonly endedAt: string;
  readonly featureId?: string;
  readonly featureSlug?: string;
  readonly taskId?: string;
  readonly success: boolean;
  readonly result?: "passed" | "warnings" | "failed";
  readonly artifactWrites?: readonly string[];
  readonly estimatedTokens?: number;
  readonly actualTokens?: number;
  readonly warnings?: readonly string[];
  readonly errors?: readonly string[];
  readonly events?: readonly Omit<RunEvent, "id" | "runId" | "command" | "createdAt">[];
  readonly dryRun?: boolean;
};

async function loadRunIndex(targetPath: string): Promise<Result<RunIndex, VispError>> {
  const indexPath = runIndexArtifactPath(targetPath);
  const exists = await pathExists(indexPath);

  if (!exists.ok) return exists;
  if (!exists.value) return ok({ latestRunId: null, runs: [] });

  return readArtifact(indexPath, runIndexSchema, {
    artifactName: "run index"
  });
}

function resultFrom(input: RecordRunInput): "passed" | "warnings" | "failed" {
  if (input.result !== undefined) return input.result;
  if (!input.success) return "failed";
  return (input.warnings?.length ?? 0) > 0 ? "warnings" : "passed";
}

export async function recordRun(input: RecordRunInput): Promise<
  Result<
    {
      readonly runId: string;
      readonly writtenFiles: readonly string[];
    },
    VispError
  >
> {
  const index = await loadRunIndex(input.targetPath);

  if (!index.ok) return index;

  const runId = nextRunId(index.value.runs.map((run) => run.id));
  const startedAt = input.startedAt ?? input.endedAt;
  const durationMs = Math.max(0, Date.parse(input.endedAt) - Date.parse(startedAt));
  const result = resultFrom(input);
  const baseEvents: RunEvent[] = [
    {
      id: eventId(0),
      runId,
      type: "command_started",
      command: input.command,
      featureId: input.featureId,
      featureSlug: input.featureSlug,
      taskId: input.taskId,
      message: `${input.command} started.`,
      createdAt: startedAt
    },
    ...(input.events ?? []).map((event, index) => ({
      ...event,
      id: eventId(index + 1),
      runId,
      command: input.command,
      featureId: event.featureId ?? input.featureId,
      featureSlug: event.featureSlug ?? input.featureSlug,
      taskId: event.taskId ?? input.taskId,
      createdAt: input.endedAt
    })),
    {
      id: eventId((input.events?.length ?? 0) + 1),
      runId,
      type: input.success ? "command_completed" : "command_failed",
      command: input.command,
      featureId: input.featureId,
      featureSlug: input.featureSlug,
      taskId: input.taskId,
      message: `${input.command} ${input.success ? "completed" : "failed"}.`,
      createdAt: input.endedAt
    }
  ];
  const run: RunArtifact = {
    id: runId,
    command: input.command,
    targetPath: input.targetPath,
    featureId: input.featureId,
    featureSlug: input.featureSlug,
    taskId: input.taskId,
    startedAt,
    endedAt: input.endedAt,
    durationMs,
    success: input.success,
    result,
    artifactWrites: [...new Set(input.artifactWrites ?? [])].sort(),
    estimatedTokens: input.estimatedTokens,
    actualTokens: input.actualTokens,
    warnings: [...new Set(input.warnings ?? [])],
    errors: [...new Set(input.errors ?? [])],
    eventCount: baseEvents.length
  };
  const nextIndex: RunIndex = {
    latestRunId: runId,
    runs: [
      ...index.value.runs,
      {
        id: runId,
        command: input.command,
        featureId: input.featureId,
        featureSlug: input.featureSlug,
        taskId: input.taskId,
        startedAt,
        endedAt: input.endedAt,
        success: input.success,
        result,
        runPath: relativePath(input.targetPath, runArtifactPath(input.targetPath, runId))
      }
    ]
  };

  if (input.dryRun) {
    return ok({ runId, writtenFiles: [] });
  }

  const runWrite = await writeArtifact(
    runArtifactPath(input.targetPath, runId),
    runArtifactSchema,
    run,
    { artifactName: "run" }
  );

  if (!runWrite.ok) return runWrite;

  const eventValidation = baseEvents.map((event) => runEventSchema.safeParse(event));
  const invalidEvent = eventValidation.find((event) => !event.success);

  if (invalidEvent !== undefined && !invalidEvent.success) {
    return ok({ runId, writtenFiles: [] });
  }

  const eventsWrite = await writeTextFile(
    runEventsPath(input.targetPath, runId),
    `${baseEvents.map((event) => JSON.stringify(event)).join("\n")}\n`
  );

  if (!eventsWrite.ok) return eventsWrite;

  const markdownWrite = await writeTextFile(
    runMarkdownPath(input.targetPath, runId),
    renderRunMarkdown({ run, events: baseEvents })
  );

  if (!markdownWrite.ok) return markdownWrite;

  const indexWrite = await writeArtifact(
    runIndexArtifactPath(input.targetPath),
    runIndexSchema,
    nextIndex,
    { artifactName: "run index" }
  );

  if (!indexWrite.ok) return indexWrite;

  return ok({
    runId,
    writtenFiles: [
      relativePath(input.targetPath, runArtifactPath(input.targetPath, runId)),
      relativePath(input.targetPath, runEventsPath(input.targetPath, runId)),
      relativePath(input.targetPath, runMarkdownPath(input.targetPath, runId)),
      relativePath(input.targetPath, runIndexArtifactPath(input.targetPath))
    ]
  });
}
