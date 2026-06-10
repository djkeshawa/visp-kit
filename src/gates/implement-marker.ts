import { writeArtifact } from "../artifacts/artifact-writer.js";
import {
  implementMarkerSchema,
  type ImplementMarker
} from "../artifacts/schemas/implement-marker.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { type VispError } from "../core/errors.js";
import { removeFile } from "../core/file-system.js";
import { joinPath, vispDir } from "../core/paths.js";
import { type Result } from "../core/result.js";

export function implementMarkerPath(targetPath: string): string {
  return joinPath(vispDir(targetPath), "state", "implement-allowed.json");
}

export async function writeImplementMarker(input: {
  readonly targetPath: string;
  readonly task: Task;
  readonly featureId: string | null;
  readonly strictnessMode: StrictnessMode;
  readonly now: string;
}): Promise<Result<string, VispError>> {
  const marker: ImplementMarker = {
    version: "1.0",
    taskId: input.task.id,
    featureId: input.featureId,
    strictnessMode: input.strictnessMode,
    allowedFiles: input.task.allowedFiles,
    expectedFiles: input.task.expectedFiles ?? [],
    forbiddenFiles: input.task.forbiddenFiles ?? [],
    createdAt: input.now
  };

  return writeArtifact(
    implementMarkerPath(input.targetPath),
    implementMarkerSchema,
    marker,
    { artifactName: "implement marker" }
  );
}

export async function clearImplementMarker(
  targetPath: string
): Promise<Result<void, VispError>> {
  return removeFile(implementMarkerPath(targetPath));
}
