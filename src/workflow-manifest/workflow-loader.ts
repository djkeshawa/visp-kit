import { workflowManifestArtifactPath } from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import {
  workflowManifestSchema,
  type WorkflowManifest
} from "../artifacts/schemas/workflow.schema.js";
import { type VispError } from "../core/errors.js";
import { pathExists } from "../core/file-system.js";
import { ok, type Result } from "../core/result.js";
import { defaultWorkflowManifest } from "./default-workflow.js";

export async function loadWorkflowManifest(input: {
  readonly targetPath: string;
  readonly now: string;
}): Promise<
  Result<
    {
      readonly manifest: WorkflowManifest;
      readonly exists: boolean;
      readonly warnings: readonly string[];
    },
    VispError
  >
> {
  const manifestPath = workflowManifestArtifactPath(input.targetPath);
  const exists = await pathExists(manifestPath);

  if (!exists.ok) return exists;
  if (!exists.value) {
    return ok({
      manifest: defaultWorkflowManifest(input.now),
      exists: false,
      warnings: [".visp/workflow.json is missing. Using the built-in workflow manifest."]
    });
  }

  const artifact = await readArtifact(manifestPath, workflowManifestSchema, {
    artifactName: "workflow manifest"
  });

  if (!artifact.ok) return artifact;

  return ok({
    manifest: artifact.value,
    exists: true,
    warnings: []
  });
}

export async function writeDefaultWorkflowManifest(input: {
  readonly targetPath: string;
  readonly now: string;
  readonly dryRun: boolean;
}): Promise<Result<boolean, VispError>> {
  if (input.dryRun) return ok(false);

  const write = await writeArtifact(
    workflowManifestArtifactPath(input.targetPath),
    workflowManifestSchema,
    defaultWorkflowManifest(input.now),
    { artifactName: "workflow manifest" }
  );

  if (!write.ok) return write;
  return ok(true);
}
