import { projectStatusArtifactPath } from "../../artifacts/artifact-paths.js";
import { readArtifact } from "../../artifacts/artifact-reader.js";
import { writeArtifact } from "../../artifacts/artifact-writer.js";
import {
  projectStatusSchema,
  type ProjectLastCommand,
  type ProjectStatus,
  type ProjectWorkflowState
} from "../../artifacts/schemas/project.schema.js";
import { type VispError } from "../../core/errors.js";
import { ok, type Result } from "../../core/result.js";
import { type ActiveFeature } from "./active-feature.js";

export async function updateWorkflowStatus(input: {
  readonly targetPath: string;
  readonly feature: ActiveFeature;
  readonly state: ProjectWorkflowState;
  readonly lastCommand: ProjectLastCommand;
  readonly now: string;
  readonly dryRun: boolean;
}): Promise<Result<void, VispError>> {
  const existing = await readArtifact(
    projectStatusArtifactPath(input.targetPath),
    projectStatusSchema,
    { artifactName: "project status" }
  );

  if (!existing.ok) return existing;

  const status: ProjectStatus = {
    ...existing.value,
    initialized: true,
    activeFeatureId: input.feature.id,
    activeFeatureSlug: input.feature.slug,
    activeFeaturePath: input.feature.relativePath,
    currentState: input.state,
    lastCommand: input.lastCommand,
    updatedAt: input.now
  };

  if (input.dryRun) {
    return ok(undefined);
  }

  return writeArtifact(projectStatusArtifactPath(input.targetPath), projectStatusSchema, status, {
    artifactName: "project status"
  }).then((result) => (result.ok ? ok(undefined) : result));
}
