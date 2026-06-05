import { overridesArtifactPath } from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import {
  overrideArtifactSchema,
  type OverrideArtifact
} from "../artifacts/schemas/override.schema.js";
import { VispError } from "../core/errors.js";
import { pathExists } from "../core/file-system.js";
import { err, ok, type Result } from "../core/result.js";
import { ensureVispProject } from "../policy/policy-loader.js";

export function emptyOverrideArtifact(): OverrideArtifact {
  return {
    version: "1.0",
    overrides: []
  };
}

export async function readOverrideStore(
  targetPath: string
): Promise<Result<{
  readonly artifact: OverrideArtifact;
  readonly exists: boolean;
  readonly path: string;
}, VispError>> {
  const initialized = await ensureVispProject(targetPath);

  if (!initialized.ok) return initialized;

  const artifactPath = overridesArtifactPath(targetPath);
  const exists = await pathExists(artifactPath);

  if (!exists.ok) return exists;
  if (!exists.value) {
    return ok({
      artifact: emptyOverrideArtifact(),
      exists: false,
      path: artifactPath
    });
  }

  const artifact = await readArtifact(artifactPath, overrideArtifactSchema, {
    artifactName: "policy overrides"
  });

  if (!artifact.ok) return artifact;

  return ok({
    artifact: artifact.value,
    exists: true,
    path: artifactPath
  });
}

export async function writeOverrideStore(
  targetPath: string,
  artifact: OverrideArtifact
): Promise<Result<string, VispError>> {
  const parsed = overrideArtifactSchema.safeParse(artifact);

  if (!parsed.success) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Invalid overrides artifact: ${parsed.error.issues[0]?.message ?? "unknown error"}`
      )
    );
  }

  return writeArtifact(overridesArtifactPath(targetPath), overrideArtifactSchema, parsed.data, {
    artifactName: "policy overrides"
  });
}
