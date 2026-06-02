import { taskGraphArtifactPath } from "../../artifacts/artifact-paths.js";
import { readArtifact } from "../../artifacts/artifact-reader.js";
import {
  taskGraphArtifactSchema,
  type TaskGraphArtifact
} from "../../artifacts/schemas/task.schema.js";
import { VispError } from "../../core/errors.js";
import { type Result } from "../../core/result.js";

export function loadTaskGraph(input: {
  readonly targetPath: string;
  readonly featureKey: string;
}): Promise<Result<TaskGraphArtifact, VispError>> {
  return readArtifact(
    taskGraphArtifactPath(input.targetPath, input.featureKey),
    taskGraphArtifactSchema,
    { artifactName: "task graph" }
  );
}
