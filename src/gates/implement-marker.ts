import { readdir } from "node:fs/promises";

import { writeArtifact } from "../artifacts/artifact-writer.js";
import {
  implementMarkerSchema,
  type ImplementMarker
} from "../artifacts/schemas/implement-marker.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { type VispError } from "../core/errors.js";
import { readJsonFile, removeFile } from "../core/file-system.js";
import { joinPath, vispDir } from "../core/paths.js";
import { ok, type Result } from "../core/result.js";

export function implementMarkerPath(targetPath: string): string {
  return joinPath(vispDir(targetPath), "state", "implement-allowed.json");
}

export function implementMarkerDirPath(targetPath: string): string {
  return joinPath(vispDir(targetPath), "state", "implement-allowed");
}

export function taskImplementMarkerPath(targetPath: string, taskId: string): string {
  return joinPath(implementMarkerDirPath(targetPath), `${taskId}.json`);
}

function markerFor(input: {
  readonly task: Task;
  readonly featureId: string | null;
  readonly strictnessMode: StrictnessMode;
  readonly now: string;
}): ImplementMarker {
  return {
    version: "1.0",
    taskId: input.task.id,
    featureId: input.featureId,
    strictnessMode: input.strictnessMode,
    allowedFiles: input.task.allowedFiles,
    expectedFiles: input.task.expectedFiles ?? [],
    forbiddenFiles: input.task.forbiddenFiles ?? [],
    createdAt: input.now
  };
}

export async function writeImplementMarker(input: {
  readonly targetPath: string;
  readonly task: Task;
  readonly featureId: string | null;
  readonly strictnessMode: StrictnessMode;
  readonly now: string;
}): Promise<Result<string, VispError>> {
  const marker = markerFor(input);

  // Per-task marker enables concurrent task authorizations; the legacy single
  // marker stays dual-written for hooks generated before the directory form
  // existed. Upgrade hooks with `visp hooks claude|git --force`.
  const taskWrite = await writeArtifact(
    taskImplementMarkerPath(input.targetPath, input.task.id),
    implementMarkerSchema,
    marker,
    { artifactName: "implement marker" }
  );

  if (!taskWrite.ok) return taskWrite;

  return writeArtifact(implementMarkerPath(input.targetPath), implementMarkerSchema, marker, {
    artifactName: "implement marker"
  });
}

export async function listActiveImplementMarkers(
  targetPath: string
): Promise<readonly ImplementMarker[]> {
  let entries: readonly string[];

  try {
    entries = (await readdir(implementMarkerDirPath(targetPath))).filter((name) =>
      name.endsWith(".json")
    );
  } catch {
    entries = [];
  }

  const markers = new Map<string, ImplementMarker>();

  for (const name of entries) {
    const raw = await readJsonFile<unknown>(joinPath(implementMarkerDirPath(targetPath), name));

    if (!raw.ok) continue;

    const parsed = implementMarkerSchema.safeParse(raw.value);

    if (parsed.success) markers.set(parsed.data.taskId, parsed.data);
  }

  // Legacy single marker still counts as an active authorization when no
  // per-task marker covers its task.
  const legacy = await readJsonFile<unknown>(implementMarkerPath(targetPath));

  if (legacy.ok) {
    const parsed = implementMarkerSchema.safeParse(legacy.value);

    if (parsed.success && !markers.has(parsed.data.taskId)) {
      markers.set(parsed.data.taskId, parsed.data);
    }
  }

  return [...markers.values()].sort((left, right) => left.taskId.localeCompare(right.taskId));
}

export async function clearTaskImplementMarker(
  targetPath: string,
  taskId: string
): Promise<Result<void, VispError>> {
  const taskCleared = await removeFile(taskImplementMarkerPath(targetPath, taskId));

  if (!taskCleared.ok) return taskCleared;

  // Clear the legacy marker only when it authorizes the same task; another
  // task's authorization must survive.
  const legacy = await readJsonFile<unknown>(implementMarkerPath(targetPath));

  if (legacy.ok) {
    const parsed = implementMarkerSchema.safeParse(legacy.value);

    if (!parsed.success || parsed.data.taskId === taskId) {
      return removeFile(implementMarkerPath(targetPath));
    }
  }

  return ok(undefined);
}

export async function clearImplementMarker(targetPath: string): Promise<Result<void, VispError>> {
  return removeFile(implementMarkerPath(targetPath));
}
